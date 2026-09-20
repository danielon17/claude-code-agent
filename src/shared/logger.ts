import pino from 'pino';
import { config } from './config.js';

/**
 * Logger estructurado (JSON en producción, formato legible en desarrollo).
 * Se usa en toda la aplicación en vez de `console.log` para permitir
 * correlación de eventos, niveles y redirección de salida sin tocar código.
 */
export const logger = pino({
  level: config.logLevel,
  transport: config.prettyLogs
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export type Logger = typeof logger;
