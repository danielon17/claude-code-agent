export interface RetryOptions {
  /** Intentos totales, incluyendo el primero. */
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  /** Decide si vale la pena reintentar un error dado; por defecto reintenta cualquiera. */
  isRetryable?: (error: unknown) => boolean;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

/**
 * Ejecuta `fn` reintentando con backoff exponencial + jitter ante errores
 * transitorios (timeouts, 429, 5xx de una API externa). El jitter evita que
 * múltiples reintentos converjan en el mismo instante ("thundering herd")
 * si el proceso reintenta varias llamadas a la vez.
 */
/** Calcula el delay de un intento dado: backoff exponencial con techo, más hasta un 20% de jitter aleatorio. */
export function calculateBackoffDelayMs(
  attempt: number,
  options: Pick<RetryOptions, 'initialDelayMs' | 'maxDelayMs'> = {},
): number {
  const initialDelayMs = options.initialDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const backoff = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
  const jitter = Math.random() * backoff * 0.2;
  return Math.round(backoff + jitter);
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const isRetryable = options.isRetryable ?? (() => true);

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }
      const delayMs = calculateBackoffDelayMs(attempt, options);
      options.onRetry?.(attempt, delayMs, error);
      await sleep(delayMs);
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
