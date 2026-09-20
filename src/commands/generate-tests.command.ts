import type { Command } from 'commander';
import { createContainer } from '../container.js';
import { isAppError } from '../shared/errors.js';

interface GenerateTestsCliOptions {
  framework: 'vitest' | 'jest';
  outputDir?: string;
}

/**
 * Subcomando `generate-tests <target>`: genera tests unitarios (Vitest o
 * Jest) a partir de las funciones/métodos exportados detectados en el AST.
 */
export function registerGenerateTestsCommand(program: Command): void {
  program
    .command('generate-tests')
    .description('Genera tests unitarios para las funciones y métodos de un archivo o directorio.')
    .argument('<target>', 'Ruta al archivo o directorio a testear')
    .option('--framework <framework>', 'Framework de testing: vitest | jest', 'vitest')
    .option('--output-dir <dir>', 'Directorio donde escribir los tests generados (por defecto junto al código fuente)')
    .action(async (target: string, options: GenerateTestsCliOptions) => {
      const { logger } = createContainer();

      try {
        logger.info({ target, options }, 'Iniciando generación de tests');
        logger.warn(
          'GenerateTestsUseCase aún no está implementado — este comando queda cableado a la espera del siguiente paso del roadmap.',
        );
      } catch (error) {
        if (isAppError(error)) {
          logger.error({ code: error.code, err: error }, error.message);
        } else {
          logger.error({ err: error }, 'Error inesperado durante la generación de tests');
        }
        process.exitCode = 1;
      }
    });
}
