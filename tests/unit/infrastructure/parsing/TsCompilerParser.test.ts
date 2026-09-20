import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TsCompilerParser } from '../../../../src/infrastructure/parsing/TsCompilerParser.js';
import { ParsingError } from '../../../../src/shared/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../../../fixtures/sample-parsing.ts');

describe('TsCompilerParser', () => {
  describe('parseFile', () => {
    it('extrae funciones, clases, métodos, interfaces, type aliases y funciones flecha', async () => {
      const parser = new TsCompilerParser();
      const units = await parser.parseFile(FIXTURE_PATH);

      const byName = Object.fromEntries(units.map((u) => [u.name, u]));

      expect(units).toHaveLength(6);
      expect(byName['add']?.kind).toBe('function');
      expect(byName['Calculator']?.kind).toBe('class');
      expect(byName['Calculator.add']?.kind).toBe('method');
      expect(byName['multiply']?.kind).toBe('arrow-function');
      expect(byName['Point']?.kind).toBe('interface');
      expect(byName['Id']?.kind).toBe('type-alias');
    });

    it('detecta las dependencias importadas usadas dentro de una unidad', async () => {
      const parser = new TsCompilerParser();
      const units = await parser.parseFile(FIXTURE_PATH);
      const addFn = units.find((u) => u.name === 'add' && u.kind === 'function');
      expect(addFn?.dependencies).toEqual(['helper']);
    });

    it('calcula la ubicación (línea/columna) y el conteo de tokens de cada unidad', async () => {
      const parser = new TsCompilerParser();
      const units = await parser.parseFile(FIXTURE_PATH);
      const addFn = units.find((u) => u.name === 'add' && u.kind === 'function');
      expect(addFn?.location.startLine).toBe(3);
      expect(addFn?.estimatedTokens).toBeGreaterThan(0);
    });

    it('lanza ParsingError si el archivo no existe', async () => {
      const parser = new TsCompilerParser();
      await expect(parser.parseFile('/ruta/inexistente.ts')).rejects.toBeInstanceOf(ParsingError);
    });
  });

  describe('parseDirectory', () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'ts-compiler-parser-'));
      await writeFile(path.join(dir, 'a.ts'), 'export function fromA(): void {}\n');
      await writeFile(path.join(dir, 'b.ts'), 'export function fromB(): void {}\n');
      await writeFile(path.join(dir, 'ignored.test.ts'), 'export function fromTest(): void {}\n');
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('parsea recursivamente todos los archivos .ts del directorio', async () => {
      const parser = new TsCompilerParser();
      const units = await parser.parseDirectory(dir);
      const names = units.map((u) => u.name).sort();
      expect(names).toEqual(['fromA', 'fromB']);
    });

    it('excluye por defecto los archivos *.test.ts', async () => {
      const parser = new TsCompilerParser();
      const units = await parser.parseDirectory(dir);
      expect(units.some((u) => u.name === 'fromTest')).toBe(false);
    });

    it('respeta excludePatterns explícitos', async () => {
      const parser = new TsCompilerParser();
      const units = await parser.parseDirectory(dir, { excludePatterns: ['**/b.ts', '**/*.test.ts'] });
      expect(units.map((u) => u.name)).toEqual(['fromA']);
    });

    it('ignora archivos que superen maxFileSizeBytes', async () => {
      const parser = new TsCompilerParser();
      const units = await parser.parseDirectory(dir, { maxFileSizeBytes: 1 });
      expect(units).toHaveLength(0);
    });
  });

  describe('parse (dispatch archivo/directorio)', () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'ts-compiler-parser-dispatch-'));
      await writeFile(path.join(dir, 'a.ts'), 'export function fromA(): void {}\n');
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('delega en parseFile si la ruta es un archivo', async () => {
      const parser = new TsCompilerParser();
      const units = await parser.parse(FIXTURE_PATH);
      expect(units.map((u) => u.name).sort()).toEqual(['Calculator', 'Calculator.add', 'Id', 'Point', 'add', 'multiply']);
    });

    it('delega en parseDirectory si la ruta es un directorio', async () => {
      const parser = new TsCompilerParser();
      const units = await parser.parse(dir);
      expect(units.map((u) => u.name)).toEqual(['fromA']);
    });

    it('lanza ParsingError si la ruta no existe', async () => {
      const parser = new TsCompilerParser();
      await expect(parser.parse('/ruta/que/no/existe')).rejects.toBeInstanceOf(ParsingError);
    });
  });
});
