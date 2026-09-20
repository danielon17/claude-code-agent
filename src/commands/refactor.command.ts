import type { Command } from 'commander';
import { createContainer, type AppContainer } from '../container.js';
import { isAppError } from '../shared/errors.js';

export interface RefactorCliOptions {
  apply: boolean;
  format: 'text' | 'json' | 'markdown';
  output?: string;
}

type RefactorCommandDeps = Pick<AppContainer, 'logger'>;

/**
 * Lógica del subcomando `refactor`, separada del registro en Commander para
 * poder testearla de forma aislada. Por defecto es un dry-run (solo
 * muestra el patch); con `--apply` lo escribe directamente sobre el
 * archivo de origen.
 */
export async function runRefactorCommand(
  target: string,
  options: RefactorCliOptions,
  { logger }: RefactorCommandDeps,
): Promise<void> {
  try {
    logger.info({ target, options }, 'Iniciando generación de refactorizaciones');
    logger.warn(
      'RefactorCodeUseCase aún no está implementado — este comando queda cableado a la espera del siguiente paso del roadmap.',
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
    .action(async (target: string, options: RefactorCliOptions) => {
      await runRefactorCommand(target, options, createContainer());
    });
}
