import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

/**
 * Esquema de validación de variables de entorno. Falla rápido y con un
 * mensaje claro si la configuración es inválida, en vez de propagar
 * `undefined` por el resto de la aplicación. Los valores numéricos usan
 * `z.coerce` porque las variables de entorno siempre llegan como string.
 */
const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  CLAUDE_MODEL: z.string().default('claude-sonnet-5'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** Intentos totales (incluido el primero) ante errores transitorios de la API de Claude. */
  ANTHROPIC_MAX_RETRIES: z.coerce.number().int().min(1).max(10).default(3),
  /** Delay inicial del backoff exponencial entre reintentos. */
  ANTHROPIC_RETRY_INITIAL_DELAY_MS: z.coerce.number().int().min(0).default(500),
  /** Techo del backoff exponencial, para no esperar minutos ante fallas repetidas. */
  ANTHROPIC_RETRY_MAX_DELAY_MS: z.coerce.number().int().min(0).default(8000),
  /** Intervalo mínimo entre requests salientes a Claude, para no exceder el límite de RPM de la cuenta. */
  ANTHROPIC_MIN_REQUEST_INTERVAL_MS: z.coerce.number().int().min(0).default(0),
  /** Endpoint OTLP/HTTP para exportar traces (estándar OpenTelemetry). Sin configurar, no se exporta telemetría a ningún lado. */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
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
  anthropic: {
    maxRetries: env.ANTHROPIC_MAX_RETRIES,
    retryInitialDelayMs: env.ANTHROPIC_RETRY_INITIAL_DELAY_MS,
    retryMaxDelayMs: env.ANTHROPIC_RETRY_MAX_DELAY_MS,
    minRequestIntervalMs: env.ANTHROPIC_MIN_REQUEST_INTERVAL_MS,
  },
  otel: {
    exporterEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  },
} as const;

export type AppConfig = typeof config;
