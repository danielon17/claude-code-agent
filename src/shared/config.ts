import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

/**
 * Esquema de validación de variables de entorno. Falla rápido y con un
 * mensaje claro si la configuración es inválida, en vez de propagar
 * `undefined` por el resto de la aplicación.
 */
const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  CLAUDE_MODEL: z.string().default('claude-sonnet-5'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

function parseEnv() {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Configuración de entorno inválida:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

const env = parseEnv();

export const config = {
  anthropicApiKey: env.ANTHROPIC_API_KEY,
  claudeModel: env.CLAUDE_MODEL,
  logLevel: env.LOG_LEVEL,
  nodeEnv: env.NODE_ENV,
  prettyLogs: env.NODE_ENV !== 'production',
} as const;

export type AppConfig = typeof config;
