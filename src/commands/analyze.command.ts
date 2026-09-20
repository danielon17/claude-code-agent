import type { Command } from 'commander';
import { createContainer } from '../container.js';
import { isAppError } from '../shared/errors.js';

interface AnalyzeCliOptions {
  format: 'text' | 'json' | 'markdown';
  output?: string;
  include?: string[];
  exclude?: string[];
  maxTokens: string;
}

/**
 * Subcomando `analyze <target>`: análisis semántico + estático de un
 * archivo o directorio, combinando AST local (TypeScript Compiler API) con
 * el modelo de Claude para detectar complejidad, duplicación, seguridad,
 * naming y mantenibilidad.
 */
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
      const { logger } = createContainer();

      try {
        logger.info({ target, options }, 'Iniciando análisis');
        logger.warn(
          'AnalyzeCodebaseUseCase aún no está implementado — este comando queda cableado a la espera del siguiente paso del roadmap.',
        );
      } catch (error) {
        if (isAppError(error)) {
          logger.error({ code: error.code, err: error }, error.message);
        } else {
          logger.error({ err: error }, 'Error inesperado durante el análisis');
        }
        process.exitCode = 1;
      }
    });
}
