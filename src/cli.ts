#!/usr/bin/env node
import { Command } from 'commander';
import { registerAnalyzeCommand } from './commands/analyze.command.js';
import { registerRefactorCommand } from './commands/refactor.command.js';
import { registerGenerateTestsCommand } from './commands/generate-tests.command.js';
import { logger } from './shared/logger.js';
import { isAppError } from './shared/errors.js';

const program = new Command();

program
  .name('code-agent')
  .description(
    'Agente CLI de análisis y refactorización de código en tiempo real, potenciado por la API de Claude.',
  )
  .version('0.1.0')
  .option(
    '--log-level <level>',
    'Nivel de logging: fatal | error | warn | info | debug | trace',
  )
  .hook('preAction', (thisCommand) => {
    const level = thisCommand.opts<{ logLevel?: string }>().logLevel;
    if (level) {
      logger.level = level;
    }
  });

registerAnalyzeCommand(program);
registerRefactorCommand(program);
registerGenerateTestsCommand(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  if (isAppError(error)) {
    logger.error({ code: error.code, err: error }, error.message);
  } else {
    logger.error({ err: error }, 'Error no controlado en el CLI');
  }
  process.exitCode = 1;
});
