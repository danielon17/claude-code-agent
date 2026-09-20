import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAnalyzeCommand, type AnalyzeCliOptions } from '../../../src/commands/analyze.command.js';
import { TsCompilerParser } from '../../../src/infrastructure/parsing/TsCompilerParser.js';
import { ConfigurationError } from '../../../src/shared/errors.js';
import { createFakeLogger } from '../../helpers/fakeLogger.js';
import { createFakeLlmClient } from '../../helpers/fakes.js';

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

describe('runAnalyzeCommand', () => {
  it('analiza el target y reporta un resumen sin lanzar', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();
    const { llm } = createFakeLlmClient(['[]']);

    await runAnalyzeCommand(FIXTURE_PATH, baseOptions, { logger, parser, createLlmClient: () => llm });

    const summary = calls.find(
      (call) => call.level === 'info' && typeof call.args[1] === 'string' && call.args[1].includes('no se encontraron'),
    );
    expect(summary).toBeDefined();
    expect(summary?.args[0]).toMatchObject({ unitsAnalyzed: 6, findings: 0 });
    expect(process.exitCode).toBeUndefined();
  });

  it('pinta en stdout los tokens de texto streameados por el LLM', async () => {
    const { logger } = createFakeLogger();
    const parser = new TsCompilerParser();
    const { llm } = createFakeLlmClient(['[]']);

    await runAnalyzeCommand(FIXTURE_PATH, baseOptions, { logger, parser, createLlmClient: () => llm });

    const written = stdoutWriteSpy.mock.calls.map((call) => call[0]).join('');
    expect(written).toContain('[]');
  });

  it('marca process.exitCode = 1 y loguea el error si --max-tokens es inválido', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();
    const { llm } = createFakeLlmClient([]);

    await runAnalyzeCommand(
      FIXTURE_PATH,
      { ...baseOptions, maxTokens: 'no-es-un-numero' },
      { logger, parser, createLlmClient: () => llm },
    );

    expect(process.exitCode).toBe(1);
    expect(calls.some((call) => call.level === 'error')).toBe(true);
  });

  it('marca process.exitCode = 1 si el target no existe', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();
    const { llm } = createFakeLlmClient([]);

    await runAnalyzeCommand('./ruta/que/no/existe.ts', baseOptions, { logger, parser, createLlmClient: () => llm });

    expect(process.exitCode).toBe(1);
    expect(calls.some((call) => call.level === 'error')).toBe(true);
  });

  it('marca process.exitCode = 1 si falta la API key de Claude (createLlmClient lanza)', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();

    await runAnalyzeCommand(FIXTURE_PATH, baseOptions, {
      logger,
      parser,
      createLlmClient: () => {
        throw new ConfigurationError('ANTHROPIC_API_KEY no está configurada.');
      },
    });

    expect(process.exitCode).toBe(1);
    expect(calls.some((call) => call.level === 'error' && String(call.args[1] ?? '').includes('ANTHROPIC_API_KEY'))).toBe(
      true,
    );
  });

  it('avisa si se pide --format distinto de text (aún no implementado)', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();
    const { llm } = createFakeLlmClient(['[]']);

    await runAnalyzeCommand(
      FIXTURE_PATH,
      { ...baseOptions, format: 'json' },
      { logger, parser, createLlmClient: () => llm },
    );

    expect(calls.some((call) => call.level === 'warn' && String(call.args[0]).includes('--format json'))).toBe(true);
  });
});
