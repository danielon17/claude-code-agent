import type { Command } from 'commander';
import { createContainer, type AppContainer } from '../container.js';
import { isAppError } from '../shared/errors.js';
import { GenerateTestsUseCase } from '../core/use-cases/GenerateTests.usecase.js';
import { createFormatter } from '../infrastructure/formatters/createFormatter.js';
import type { TestFramework } from '../core/entities/GeneratedTest.js';
import type { OutputFormat } from '../core/ports/OutputFormatter.port.js';

export interface GenerateTestsCliOptions {
  framework: TestFramework;
  outputDir?: string;
  format: OutputFormat;
  include?: string[];
  exclude?: string[];
  maxTokens: string;
}

type GenerateTestsCommandDeps = Pick<AppContainer, 'logger' | 'parser' | 'fileSystem' | 'createLlmClient'>;

/**
 * Lógica del subcomando `generate-tests`, separada del registro en
 * Commander para poder testearla de forma aislada. Genera un archivo de
 * test por archivo fuente (agrupando sus funciones exportadas) y lo
 * escribe junto al código fuente, o en `--output-dir` si se especifica.
 */
export async function runGenerateTestsCommand(
  target: string,
  options: GenerateTestsCliOptions,
  { logger, parser, fileSystem, createLlmClient }: GenerateTestsCommandDeps,
): Promise<void> {
  try {
    const maxTokensPerChunk = Number.parseInt(options.maxTokens, 10);
    if (!Number.isFinite(maxTokensPerChunk) || maxTokensPerChunk <= 0) {
      throw new RangeError(`--max-tokens debe ser un entero positivo, recibido: "${options.maxTokens}"`);
    }

    const useCase = new GenerateTestsUseCase(parser, createLlmClient(), fileSystem);
    logger.info({ target, framework: options.framework }, 'Generando tests con Claude');

    const tests = await useCase.execute({
      targetPath: target,
      framework: options.framework,
      outputDir: options.outputDir,
      includePatterns: options.include,
      excludePatterns: options.exclude,
      maxTokensPerChunk,
      onProgress: (message) => logger.info(message),
      onToken: options.format === 'text' ? (text) => process.stdout.write(text) : undefined,
    });

    const formatted = createFormatter(options.format).formatGeneratedTests(tests);
    const separator = options.format === 'text' ? '\n\n' : '';
    process.stdout.write(`${separator}${formatted}\n`);

    if (tests.length > 0) {
      logger.info(`${tests.length} archivo(s) de test escrito(s).`);
    }
  } catch (error) {
    if (isAppError(error)) {
      logger.error({ code: error.code, err: error }, error.message);
    } else {
      logger.error({ err: error }, 'Error inesperado durante la generación de tests');
    }
    process.exitCode = 1;
  }
}

export function registerGenerateTestsCommand(program: Command): void {
  program
    .command('generate-tests')
    .description('Genera tests unitarios para las funciones exportadas de un archivo o directorio.')
    .argument('<target>', 'Ruta al archivo o directorio a testear')
    .option('--framework <framework>', 'Framework de testing: vitest | jest', 'vitest')
    .option('--output-dir <dir>', 'Directorio donde escribir los tests generados (por defecto junto al código fuente)')
    .option('-f, --format <format>', 'Formato de salida del resumen: text | json | markdown', 'text')
    .option('--include <patterns...>', 'Glob patterns a incluir (ej: "src/**/*.ts")')
    .option('--exclude <patterns...>', 'Glob patterns a excluir (ej: "**/*.test.ts")')
    .option('--max-tokens <number>', 'Límite de tokens por chunk enviado al modelo', '4000')
    .action(async (target: string, options: GenerateTestsCliOptions) => {
      await runGenerateTestsCommand(target, options, createContainer());
    });
}
