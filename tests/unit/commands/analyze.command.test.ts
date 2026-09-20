import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAnalyzeCommand, type AnalyzeCliOptions } from '../../../src/commands/analyze.command.js';
import { TsCompilerParser } from '../../../src/infrastructure/parsing/TsCompilerParser.js';
import { ConfigurationError } from '../../../src/shared/errors.js';
import { createFakeLogger } from '../../helpers/fakeLogger.js';
import { createFakeFileSystem, createFakeLlmClient } from '../../helpers/fakes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/sample-parsing.ts');

const baseOptions: AnalyzeCliOptions = { format: 'text', maxTokens: '4000' };

// `runAnalyzeCommand` escribe los tokens streameados directo a stdout; lo
// interceptamos en todos los tests para no ensuciar la salida de la suite.
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  process.exitCode = undefined;
  stdoutWriteSpy.mockRestore();
});

function writtenToStdout(): string {
  return stdoutWriteSpy.mock.calls.map((call) => call[0]).join('');
}

describe('runAnalyzeCommand', () => {
  it('analiza el target y escribe el resultado formateado en stdout, sin lanzar', async () => {
    const { logger } = createFakeLogger();
    const parser = new TsCompilerParser();
    const fileSystem = createFakeFileSystem();
    const { llm } = createFakeLlmClient(['[]']);

    await runAnalyzeCommand(FIXTURE_PATH, baseOptions, { logger, parser, fileSystem, createLlmClient: () => llm });

    expect(writtenToStdout()).toContain('no se encontraron problemas');
    expect(process.exitCode).toBeUndefined();
  });

  it('con --format json, escribe un JSON válido con el resultado', async () => {
    const { logger } = createFakeLogger();
    const parser = new TsCompilerParser();
    const fileSystem = createFakeFileSystem();
    const { llm } = createFakeLlmClient(['[]']);

    await runAnalyzeCommand(
      FIXTURE_PATH,
      { ...baseOptions, format: 'json' },
      { logger, parser, fileSystem, createLlmClient: () => llm },
    );

    const parsed = JSON.parse(writtenToStdout().trim());
    expect(parsed).toMatchObject({ unitsAnalyzed: 6, findings: [] });
  });

  it('con --output, guarda el resultado formateado en el archivo en vez de stdout', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();
    const fileSystem = createFakeFileSystem();
    const { llm } = createFakeLlmClient(['[]']);

    await runAnalyzeCommand(
      FIXTURE_PATH,
      { ...baseOptions, output: '/tmp/result.txt' },
      { logger, parser, fileSystem, createLlmClient: () => llm },
    );

    await expect(fileSystem.readFile('/tmp/result.txt')).resolves.toContain('no se encontraron problemas');
    expect(calls.some((call) => String(call.args[0]).includes('/tmp/result.txt'))).toBe(true);
  });

  it('marca process.exitCode = 1 y loguea el error si --max-tokens es inválido', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();
    const fileSystem = createFakeFileSystem();
    const { llm } = createFakeLlmClient([]);

    await runAnalyzeCommand(
      FIXTURE_PATH,
      { ...baseOptions, maxTokens: 'no-es-un-numero' },
      { logger, parser, fileSystem, createLlmClient: () => llm },
    );

    expect(process.exitCode).toBe(1);
    expect(calls.some((call) => call.level === 'error')).toBe(true);
  });

  it('marca process.exitCode = 1 si el target no existe', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();
    const fileSystem = createFakeFileSystem();
    const { llm } = createFakeLlmClient([]);

    await runAnalyzeCommand('./ruta/que/no/existe.ts', baseOptions, {
      logger,
      parser,
      fileSystem,
      createLlmClient: () => llm,
    });

    expect(process.exitCode).toBe(1);
    expect(calls.some((call) => call.level === 'error')).toBe(true);
  });

  it('marca process.exitCode = 1 si falta la API key de Claude (createLlmClient lanza)', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();
    const fileSystem = createFakeFileSystem();

    await runAnalyzeCommand(FIXTURE_PATH, baseOptions, {
      logger,
      parser,
      fileSystem,
      createLlmClient: () => {
        throw new ConfigurationError('ANTHROPIC_API_KEY no está configurada.');
      },
    });

    expect(process.exitCode).toBe(1);
    expect(calls.some((call) => call.level === 'error' && String(call.args[1] ?? '').includes('ANTHROPIC_API_KEY'))).toBe(
      true,
    );
  });
});
