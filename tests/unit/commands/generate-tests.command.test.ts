import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runGenerateTestsCommand, type GenerateTestsCliOptions } from '../../../src/commands/generate-tests.command.js';
import { TsCompilerParser } from '../../../src/infrastructure/parsing/TsCompilerParser.js';
import { ConfigurationError } from '../../../src/shared/errors.js';
import { createFakeLogger } from '../../helpers/fakeLogger.js';
import { createFakeFileSystem, createFakeLlmClient } from '../../helpers/fakes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/sample-parsing.ts');

const baseOptions: GenerateTestsCliOptions = { framework: 'vitest', format: 'text', maxTokens: '4000' };

let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  process.exitCode = undefined;
  stdoutWriteSpy.mockRestore();
});

describe('runGenerateTestsCommand', () => {
  it('genera y escribe tests para las funciones exportadas del target, sin lanzar', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();
    const fileSystem = createFakeFileSystem();
    const response = JSON.stringify({ testFileSourceCode: "import { add } from './sample-parsing.js';" });
    const { llm } = createFakeLlmClient([response, response]);

    await runGenerateTestsCommand(FIXTURE_PATH, baseOptions, { logger, parser, fileSystem, createLlmClient: () => llm });

    expect(process.exitCode).toBeUndefined();
    const written = stdoutWriteSpy.mock.calls.map((call) => call[0]).join('');
    expect(written).toContain('generated.test.ts');
    expect(calls.some((call) => String(call.args[0]).includes('archivo(s) de test escrito(s)'))).toBe(true);
  });

  it('marca process.exitCode = 1 si falta la API key de Claude', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();
    const fileSystem = createFakeFileSystem();

    await runGenerateTestsCommand(FIXTURE_PATH, baseOptions, {
      logger,
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

    await runGenerateTestsCommand(
      FIXTURE_PATH,
      { ...baseOptions, maxTokens: 'no-es-un-numero' },
      { logger, parser, fileSystem, createLlmClient: () => llm },
    );

    expect(process.exitCode).toBe(1);
    expect(calls.some((call) => call.level === 'error')).toBe(true);
  });
});
