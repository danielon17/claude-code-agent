import pino from 'pino';
import { config } from './config.js';

/**
 * Logger estructurado (JSON en producción, formato legible en desarrollo).
 * Se usa en toda la aplicación en vez de `console.log` para permitir
 * correlación de eventos, niveles y redirección de salida sin tocar código.
 *
 * `redact` es defensa en profundidad: hoy ningún código loguea la API key
 * completa (solo se le pasa al SDK), pero si en el futuro alguien logueara
 * `config` o el error crudo de una request HTTP por accidente, estos campos
 * salen como "[Redacted]" en vez de filtrar el secreto a los logs.
 */
export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: ['anthropicApiKey', '*.anthropicApiKey', 'req.headers.authorization', '*.apiKey', 'config.anthropicApiKey'],
    censor: '[Redacted]',
  },
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
