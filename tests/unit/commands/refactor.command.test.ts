import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runRefactorCommand, type RefactorCliOptions } from '../../../src/commands/refactor.command.js';
import { TsCompilerParser } from '../../../src/infrastructure/parsing/TsCompilerParser.js';
import { ConfigurationError } from '../../../src/shared/errors.js';
import { createFakeLogger } from '../../helpers/fakeLogger.js';
import { createFakeFileSystem, createFakeLlmClient, createFakeTelemetry, TEST_RUN_ID } from '../../helpers/fakes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/sample-parsing.ts');

const baseOptions: RefactorCliOptions = { apply: false, format: 'text', maxTokens: '4000' };

let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  process.exitCode = undefined;
  stdoutWriteSpy.mockRestore();
});

describe('runRefactorCommand', () => {
  it('en dry-run (apply: false) reporta las sugerencias sin escribir archivos ni lanzar', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();
    const fileSystem = createFakeFileSystem();
    const response = JSON.stringify([
      { unitName: 'add', title: 'Simplificar', rationale: 'Más claro.', refactoredCode: 'function add() {}', confidence: 0.6 },
    ]);
    const { llm } = createFakeLlmClient([response]);

    await runRefactorCommand(FIXTURE_PATH, baseOptions, {
      logger,
      runId: TEST_RUN_ID,
      telemetry: createFakeTelemetry(),
      parser,
      fileSystem,
      createLlmClient: () => llm,
    });

    expect(process.exitCode).toBeUndefined();
    expect(calls.some((call) => String(call.args[0]).includes('dry-run'))).toBe(true);
  });

  it('sin sugerencias, informa en stdout que no hay oportunidades de refactor', async () => {
    const { logger } = createFakeLogger();
    const parser = new TsCompilerParser();
    const fileSystem = createFakeFileSystem();
    const { llm } = createFakeLlmClient(['[]']);

    await runRefactorCommand(FIXTURE_PATH, baseOptions, {
      logger,
      runId: TEST_RUN_ID,
      telemetry: createFakeTelemetry(),
      parser,
      fileSystem,
      createLlmClient: () => llm,
    });

    const written = stdoutWriteSpy.mock.calls.map((call) => call[0]).join('');
    expect(written).toMatch(/no se encontraron oportunidades/i);
  });

  it('marca process.exitCode = 1 si falta la API key de Claude', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();
    const fileSystem = createFakeFileSystem();

    await runRefactorCommand(FIXTURE_PATH, baseOptions, {
      logger,
      runId: TEST_RUN_ID,
      telemetry: createFakeTelemetry(),
      parser,
      fileSystem,
      createLlmClient: () => {
        throw new ConfigurationError('ANTHROPIC_API_KEY no está configurada.');
      },
    });

    expect(process.exitCode).toBe(1);
    expect(calls.some((call) => call.level === 'error')).toBe(true);
  });

  it('marca process.exitCode = 1 si --max-tokens es inválido', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();
    const fileSystem = createFakeFileSystem();
    const { llm } = createFakeLlmClient([]);

    await runRefactorCommand(
      FIXTURE_PATH,
      { ...baseOptions, maxTokens: 'no-es-un-numero' },
      {
        logger,
        runId: TEST_RUN_ID,
        telemetry: createFakeTelemetry(),
        parser,
        fileSystem,
        createLlmClient: () => llm,
      },
    );

    expect(process.exitCode).toBe(1);
    expect(calls.some((call) => call.level === 'error')).toBe(true);
  });
});
