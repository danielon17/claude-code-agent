import type { Command } from 'commander';
import { createContainer, type AppContainer } from '../container.js';
import { isAppError } from '../shared/errors.js';
import { RefactorCodeUseCase } from '../core/use-cases/RefactorCode.usecase.js';
import { createFormatter } from '../infrastructure/formatters/createFormatter.js';
import type { OutputFormat } from '../core/ports/OutputFormatter.port.js';

export interface RefactorCliOptions {
  apply: boolean;
  format: OutputFormat;
  output?: string;
  include?: string[];
  exclude?: string[];
  maxTokens: string;
}

type RefactorCommandDeps = Pick<AppContainer, 'logger' | 'parser' | 'fileSystem' | 'createLlmClient'>;

/**
 * Lógica del subcomando `refactor`, separada del registro en Commander
 * para poder testearla de forma aislada. Por defecto es un dry-run (solo
 * imprime los diffs sugeridos); con `--apply` los escribe directamente
 * sobre los archivos de origen.
 */
export async function runRefactorCommand(
  target: string,
  options: RefactorCliOptions,
  { logger, parser, fileSystem, createLlmClient }: RefactorCommandDeps,
): Promise<void> {
  try {
    const maxTokensPerChunk = Number.parseInt(options.maxTokens, 10);
    if (!Number.isFinite(maxTokensPerChunk) || maxTokensPerChunk <= 0) {
      throw new RangeError(`--max-tokens debe ser un entero positivo, recibido: "${options.maxTokens}"`);
    }

    const useCase = new RefactorCodeUseCase(parser, createLlmClient(), fileSystem);
    logger.info({ target, apply: options.apply }, 'Generando sugerencias de refactor con Claude');

    const result = await useCase.execute({
      targetPath: target,
      apply: options.apply,
      includePatterns: options.include,
      excludePatterns: options.exclude,
      maxTokensPerChunk,
      onProgress: (message) => logger.info(message),
      onToken: options.format === 'text' ? (text) => process.stdout.write(text) : undefined,
    });

    const formatted = createFormatter(options.format).formatRefactorSuggestions(result.suggestions);
    if (options.output) {
      await fileSystem.writeFile(options.output, formatted);
      logger.info(`Resultado guardado en ${options.output}`);
    } else {
      const separator = options.format === 'text' ? '\n\n' : '';
      process.stdout.write(`${separator}${formatted}\n`);
    }

    if (result.suggestions.length === 0) {
      return;
    }
    logger.info(
      options.apply
        ? `${result.appliedCount} refactor(s) aplicado(s) directamente sobre los archivos de origen.`
        : `${result.suggestions.length} sugerencia(s) generada(s) en modo dry-run. Usá --apply para escribirlas.`,
    );
  } catch (error) {
    if (isAppError(error)) {
      logger.error({ code: error.code, err: error }, error.message);
    } else {
      logger.error({ err: error }, 'Error inesperado durante la refactorización');
    }
    process.exitCode = 1;
  }
}

export function registerRefactorCommand(program: Command): void {
  program
    .command('refactor')
    .description('Genera parches (.diff) de refactorización sugeridos por Claude para un archivo o directorio.')
    .argument('<target>', 'Ruta al archivo o directorio a refactorizar')
    .option('--apply', 'Aplica los parches generados directamente sobre el archivo (por defecto es dry-run)', false)
    .option('-f, --format <format>', 'Formato de salida: text | json | markdown', 'text')
    .option('-o, --output <file>', 'Guardar los diffs generados en un archivo en lugar de stdout')
    .option('--include <patterns...>', 'Glob patterns a incluir (ej: "src/**/*.ts")')
    .option('--exclude <patterns...>', 'Glob patterns a excluir (ej: "**/*.test.ts")')
    .option('--max-tokens <number>', 'Límite de tokens por chunk enviado al modelo', '4000')
    .action(async (target: string, options: RefactorCliOptions) => {
      await runRefactorCommand(target, options, createContainer());
    });
}
