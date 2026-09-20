import type { Logger } from '../../src/shared/logger.js';

export interface LoggerCall {
  level: 'info' | 'warn' | 'error';
  args: unknown[];
}

export interface FakeLogger {
  logger: Logger;
  calls: LoggerCall[];
}

/** Doble de prueba mínimo de `Logger` (pino) que registra las llamadas en vez de escribir a stdout. */
export function createFakeLogger(): FakeLogger {
  const calls: LoggerCall[] = [];
  const record =
    (level: LoggerCall['level']) =>
    (...args: unknown[]): void => {
      calls.push({ level, args });
    };

  const logger = {
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    level: 'info',
  } as unknown as Logger;

  return { logger, calls };
}
