import { Option, type Command } from 'commander';
import { createContainer, type AppContainer } from '../container.js';
import { isAppError } from '../shared/errors.js';
import { AnalyzeCodebaseUseCase } from '../core/use-cases/AnalyzeCodebase.usecase.js';
import { createFormatter } from '../infrastructure/formatters/createFormatter.js';
import { OUTPUT_FORMATS, type OutputFormat } from '../core/ports/OutputFormatter.port.js';

export interface AnalyzeCliOptions {
  format: OutputFormat;
  output?: string;
  include?: string[];
  exclude?: string[];
  maxTokens: string;
}

type AnalyzeCommandDeps = Pick<AppContainer, 'logger' | 'parser' | 'fileSystem' | 'createLlmClient'>;

/**
 * Lógica del subcomando `analyze`, separada del registro en Commander para
 * poder testearla de forma aislada inyectando un container de prueba.
 *
 * Orquesta `AnalyzeCodebaseUseCase` (parseo AST -> chunking -> análisis
 * semántico vía Claude con streaming), pintando los tokens de la respuesta
 * en tiempo real, y al finalizar formatea el resultado con el
 * `OutputFormatter` correspondiente a `--format` (imprimiéndolo en stdout
 * o guardándolo en `--output`).
 */
export async function runAnalyzeCommand(
  target: string,
  options: AnalyzeCliOptions,
  { logger, parser, fileSystem, createLlmClient }: AnalyzeCommandDeps,
): Promise<void> {
  try {
    const maxTokensPerChunk = Number.parseInt(options.maxTokens, 10);
    if (!Number.isFinite(maxTokensPerChunk) || maxTokensPerChunk <= 0) {
      throw new RangeError(`--max-tokens debe ser un entero positivo, recibido: "${options.maxTokens}"`);
    }

    const useCase = new AnalyzeCodebaseUseCase(parser, createLlmClient());
    logger.info({ target }, 'Iniciando análisis semántico con Claude');

    const result = await useCase.execute({
      targetPath: target,
      includePatterns: options.include,
      excludePatterns: options.exclude,
      maxTokensPerChunk,
      onProgress: (message) => logger.info(message),
      // Solo pintamos tokens crudos en vivo cuando el formato final es texto:
      // con json/markdown, stdout debe quedar limpio para el resultado formateado.
      onToken: options.format === 'text' ? (text) => process.stdout.write(text) : undefined,
    });

    const formatted = createFormatter(options.format).formatAnalysis(result);
    if (options.output) {
      await fileSystem.writeFile(options.output, formatted);
      logger.info(`Resultado guardado en ${options.output}`);
    } else {
      const separator = options.format === 'text' ? '\n\n' : '';
      process.stdout.write(`${separator}${formatted}\n`);
    }
  } catch (error) {
    if (isAppError(error)) {
      logger.error({ code: error.code, err: error }, error.message);
    } else {
      logger.error({ err: error }, 'Error inesperado durante el análisis');
    }
    process.exitCode = 1;
  }
}

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description(
      'Analiza un archivo o directorio en busca de problemas de complejidad, duplicación, seguridad y mantenibilidad.',
    )
    .argument('<target>', 'Ruta al archivo o directorio a analizar')
    .addOption(new Option('-f, --format <format>', 'Formato de salida').choices(OUTPUT_FORMATS).default('text'))
    .option('-o, --output <file>', 'Guardar el resultado en un archivo en lugar de stdout')
    .option('--include <patterns...>', 'Glob patterns a incluir (ej: "src/**/*.ts")')
    .option('--exclude <patterns...>', 'Glob patterns a excluir (ej: "**/*.test.ts")')
    .option('--max-tokens <number>', 'Límite de tokens por chunk enviado al modelo', '4000')
    .action(async (target: string, options: AnalyzeCliOptions) => {
      await runAnalyzeCommand(target, options, createContainer());
    });
}
