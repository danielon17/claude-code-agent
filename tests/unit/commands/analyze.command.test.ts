import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runAnalyzeCommand, type AnalyzeCliOptions } from '../../../src/commands/analyze.command.js';
import { TsCompilerParser } from '../../../src/infrastructure/parsing/TsCompilerParser.js';
import { createFakeLogger } from '../../helpers/fakeLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/sample-parsing.ts');

const baseOptions: AnalyzeCliOptions = { format: 'text', maxTokens: '4000' };

afterEach(() => {
  process.exitCode = undefined;
});

describe('runAnalyzeCommand', () => {
  it('parsea el target, arma chunks y reporta un resumen sin lanzar', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();

    await runAnalyzeCommand(FIXTURE_PATH, baseOptions, { logger, parser });

    const summary = calls.find(
      (call) => call.level === 'info' && typeof call.args[1] === 'string' && call.args[1].includes('AST extraído'),
    );
    expect(summary).toBeDefined();
    expect(summary?.args[0]).toMatchObject({ unitsFound: 6, chunks: 1 });
    expect(process.exitCode).toBeUndefined();
  });

  it('deja un warning explícito de que el análisis semántico vía LLM no está implementado', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();

    await runAnalyzeCommand(FIXTURE_PATH, baseOptions, { logger, parser });

    expect(calls.some((call) => call.level === 'warn' && String(call.args[0]).includes('no implementado'))).toBe(
      true,
    );
  });

  it('marca process.exitCode = 1 y loguea el error si --max-tokens es inválido', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();

    await runAnalyzeCommand(FIXTURE_PATH, { ...baseOptions, maxTokens: 'no-es-un-numero' }, { logger, parser });

    expect(process.exitCode).toBe(1);
    expect(calls.some((call) => call.level === 'error')).toBe(true);
  });

  it('marca process.exitCode = 1 si el target no existe', async () => {
    const { logger, calls } = createFakeLogger();
    const parser = new TsCompilerParser();

    await runAnalyzeCommand('./ruta/que/no/existe.ts', baseOptions, { logger, parser });

    expect(process.exitCode).toBe(1);
    expect(calls.some((call) => call.level === 'error')).toBe(true);
  });
});
