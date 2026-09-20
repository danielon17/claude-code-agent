import type { Command } from 'commander';
import { createContainer, type AppContainer } from '../container.js';
import { isAppError } from '../shared/errors.js';
import { AnalyzeCodebaseUseCase } from '../core/use-cases/AnalyzeCodebase.usecase.js';

export interface AnalyzeCliOptions {
  format: 'text' | 'json' | 'markdown';
  output?: string;
  include?: string[];
  exclude?: string[];
  maxTokens: string;
}

type AnalyzeCommandDeps = Pick<AppContainer, 'logger' | 'parser' | 'createLlmClient'>;

/**
 * Lógica del subcomando `analyze`, separada del registro en Commander para
 * poder testearla de forma aislada inyectando un container de prueba.
 *
 * Orquesta `AnalyzeCodebaseUseCase` (parseo AST -> chunking -> análisis
 * semántico vía Claude con streaming) y pinta los tokens de la respuesta
 * en tiempo real a medida que llegan. `--format json|markdown` y
 * `--output` quedan pendientes para el paso de formatters del roadmap;
 * por ahora la salida es siempre texto en la terminal.
 */
export async function runAnalyzeCommand(
  target: string,
  options: AnalyzeCliOptions,
  { logger, parser, createLlmClient }: AnalyzeCommandDeps,
): Promise<void> {
  try {
    const maxTokensPerChunk = Number.parseInt(options.maxTokens, 10);
    if (!Number.isFinite(maxTokensPerChunk) || maxTokensPerChunk <= 0) {
      throw new RangeError(`--max-tokens debe ser un entero positivo, recibido: "${options.maxTokens}"`);
    }
    if (options.format !== 'text') {
      logger.warn(`--format ${options.format} aún no está implementado (llega con los formatters); usando texto.`);
    }
    if (options.output) {
      logger.warn(`--output aún no está implementado (llega con los formatters); imprimiendo en stdout.`);
    }

    const useCase = new AnalyzeCodebaseUseCase(parser, createLlmClient());

    logger.info({ target }, 'Iniciando análisis semántico con Claude');

    const result = await useCase.execute({
      targetPath: target,
      includePatterns: options.include,
      excludePatterns: options.exclude,
      maxTokensPerChunk,
      onProgress: (message) => logger.info(message),
      onToken: (text) => process.stdout.write(text),
    });

    if (result.findings.length > 0) {
      process.stdout.write('\n\n');
    }

    logger.info({ unitsAnalyzed: result.unitsAnalyzed, findings: result.findings.length }, result.summary);
    for (const finding of result.findings) {
      const location = `${finding.location.filePath}:${finding.location.startLine}`;
      logger.warn(`[${finding.severity}] [${finding.category}] ${location} — ${finding.message}`);
      if (finding.suggestion) {
        logger.info(`  sugerencia: ${finding.suggestion}`);
      }
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
    .option('-f, --format <format>', 'Formato de salida: text | json | markdown', 'text')
    .option('-o, --output <file>', 'Guardar el resultado en un archivo en lugar de stdout')
    .option('--include <patterns...>', 'Glob patterns a incluir (ej: "src/**/*.ts")')
    .option('--exclude <patterns...>', 'Glob patterns a excluir (ej: "**/*.test.ts")')
    .option('--max-tokens <number>', 'Límite de tokens por chunk enviado al modelo', '4000')
    .action(async (target: string, options: AnalyzeCliOptions) => {
      await runAnalyzeCommand(target, options, createContainer());
    });
}
