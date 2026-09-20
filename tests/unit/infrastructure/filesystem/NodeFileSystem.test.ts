import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeFileSystem } from '../../../../src/infrastructure/filesystem/NodeFileSystem.js';
import { FileSystemError } from '../../../../src/shared/errors.js';

describe('NodeFileSystem', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'node-filesystem-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('escribe y lee de vuelta el mismo contenido', async () => {
    const fs = new NodeFileSystem();
    const filePath = path.join(dir, 'file.txt');

    await fs.writeFile(filePath, 'hola mundo');
    await expect(fs.readFile(filePath)).resolves.toBe('hola mundo');
  });

  it('exists() devuelve true/false según corresponda, sin lanzar', async () => {
    const fs = new NodeFileSystem();
    const filePath = path.join(dir, 'file.txt');
    await fs.writeFile(filePath, 'x');

    await expect(fs.exists(filePath)).resolves.toBe(true);
    await expect(fs.exists(path.join(dir, 'no-existe.txt'))).resolves.toBe(false);
  });

  it('isDirectory() distingue archivos de directorios', async () => {
    const fs = new NodeFileSystem();
    const filePath = path.join(dir, 'file.txt');
    await fs.writeFile(filePath, 'x');

    await expect(fs.isDirectory(dir)).resolves.toBe(true);
    await expect(fs.isDirectory(filePath)).resolves.toBe(false);
  });

  it('readFile() lanza FileSystemError si el archivo no existe', async () => {
    const fs = new NodeFileSystem();
    await expect(fs.readFile(path.join(dir, 'no-existe.txt'))).rejects.toBeInstanceOf(FileSystemError);
  });

  it('isDirectory() lanza FileSystemError si la ruta no existe', async () => {
    const fs = new NodeFileSystem();
    await expect(fs.isDirectory(path.join(dir, 'no-existe'))).rejects.toBeInstanceOf(FileSystemError);
  });
});
