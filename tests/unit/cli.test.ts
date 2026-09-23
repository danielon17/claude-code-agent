import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerAnalyzeCommand } from '../../src/commands/analyze.command.js';
import { registerRefactorCommand } from '../../src/commands/refactor.command.js';
import { registerGenerateTestsCommand } from '../../src/commands/generate-tests.command.js';
import { TsCompilerParser } from '../../src/infrastructure/parsing/TsCompilerParser.js';
import { createFakeLogger, type FakeLogger } from '../helpers/fakeLogger.js';
import { createFakeFileSystem, createFakeLlmClient, createFakeTelemetry, TEST_RUN_ID } from '../helpers/fakes.js';
import type { AppContainer } from '../../src/container.js';

/**
 * A diferencia de tests/unit/commands/*.command.test.ts (que llaman
 * `runXCommand` directo), esta suite ejercita el árbol de Commander
 * completo vía `program.parseAsync(...)`: registro de subcomandos, parseo
 * de argumentos/opciones, defaults y la validación de `--format`/
 * `--framework` (`Option#choices`). Es el único lugar donde se verifica
 * que `cli.ts` esté realmente bien cableado, no solo la lógica de negocio
 * de cada comando.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/sample-parsing.ts');

let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  process.exitCode = undefined;
  stdoutWriteSpy.mockRestore();
});

function buildTestProgram(container: AppContainer): Command {
  const program = new Command();
  // Sin esto, un error de Commander (p.ej. --format inválido) llamaría a
  // process.exit() de verdad y mataría el proceso de test.
  program.exitOverride();
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} });

  const containerFactory = () => container;
  registerAnalyzeCommand(program, containerFactory);
  registerRefactorCommand(program, containerFactory);
  registerGenerateTestsCommand(program, containerFactory);
  return program;
}

function buildFakeContainer(
  logger: FakeLogger['logger'],
  responses: string[] = ['[]'],
  seedFiles: Record<string, string> = {},
): AppContainer {
  const { llm } = createFakeLlmClient(responses);
  return {
    config: {} as AppContainer['config'],
    logger,
    runId: TEST_RUN_ID,
    telemetry: createFakeTelemetry(),
    parser: new TsCompilerParser(),
    fileSystem: createFakeFileSystem(seedFiles),
    createLlmClient: () => llm,
  };
}

describe('CLI (Commander end-to-end)', () => {
  it('registra los 3 subcomandos con --help', async () => {
    const { logger } = createFakeLogger();
    const program = buildTestProgram(buildFakeContainer(logger));
    const names = program.commands.map((cmd) => cmd.name());
    expect(names).toEqual(['analyze', 'refactor', 'generate-tests']);
  });

  it('"analyze <target>" parsea el argumento y aplica los defaults de opciones (--format text, --max-tokens 4000)', async () => {
    const { logger } = createFakeLogger();
    const program = buildTestProgram(buildFakeContainer(logger));

    await program.parseAsync(['analyze', FIXTURE_PATH], { from: 'user' });

    const written = stdoutWriteSpy.mock.calls.map((call) => call[0]).join('');
    expect(written).toContain('no se encontraron problemas');
    expect(process.exitCode).toBeUndefined();
  });

  it('rechaza --format con un valor fuera de las choices permitidas, sin llegar a ejecutar el comando', async () => {
    const { logger } = createFakeLogger();
    const program = buildTestProgram(buildFakeContainer(logger));

    await expect(
      program.parseAsync(['analyze', FIXTURE_PATH, '--format', 'yaml'], { from: 'user' }),
    ).rejects.toBeInstanceOf(CommanderError);
  });

  it('rechaza --framework con un valor fuera de las choices permitidas en generate-tests', async () => {
    const { logger } = createFakeLogger();
    const program = buildTestProgram(buildFakeContainer(logger));

    await expect(
      program.parseAsync(['generate-tests', FIXTURE_PATH, '--framework', 'mocha'], { from: 'user' }),
    ).rejects.toBeInstanceOf(CommanderError);
  });

  it('"refactor <target> --apply" propaga el flag booleano hasta runRefactorCommand', async () => {
    const { logger } = createFakeLogger();
    const response = JSON.stringify([
      { unitName: 'add', title: 'x', rationale: 'x', refactoredCode: 'function add() {}', confidence: 0.5 },
    ]);
    // La TypeScript Compiler API normaliza `sourceFile.fileName` a forward-slash
    // incluso en Windows, así que `CodeUnit.location.filePath` (y por lo tanto la
    // clave que usa RefactorCodeUseCase para leer/escribir) queda en ese formato.
    // El filesystem real tolera ambos separadores en Windows; este doble en
    // memoria no, así que sembramos con la misma forma normalizada.
    const normalizedFixturePath = FIXTURE_PATH.split(path.sep).join('/');
    const container = buildFakeContainer(logger, [response], {
      [normalizedFixturePath]: readFileSync(FIXTURE_PATH, 'utf-8'),
    });
    const program = buildTestProgram(container);

    await program.parseAsync(['refactor', FIXTURE_PATH, '--apply'], { from: 'user' });

    expect(process.exitCode).toBeUndefined();
    const written = await container.fileSystem.readFile(normalizedFixturePath);
    expect(written).toContain('function add()');
  });

  it('falla con exit code 1 si el target no existe, sin tirar una excepción sin manejar', async () => {
    const { logger } = createFakeLogger();
    const program = buildTestProgram(buildFakeContainer(logger));

    await program.parseAsync(['analyze', '/ruta/inexistente.ts'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });
});
