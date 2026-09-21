export interface RateLimiterOptions {
  /** Intervalo mínimo entre el inicio de dos llamadas consecutivas. */
  minIntervalMs: number;
}

/**
 * Espaciador de llamadas simple (no un token bucket con ráfagas): garantiza
 * al menos `minIntervalMs` entre el inicio de dos llamadas consecutivas
 * programadas por esta instancia. Alcanza para el caso de uso real de este
 * CLI (llamadas secuenciales, una por chunk, a la API de Claude) sin la
 * complejidad de una cola con concurrencia — no hay llamadas en paralelo
 * que requieran arbitrar cupos entre sí.
 */
export class RateLimiter {
  private nextAvailableAt = 0;

  constructor(private readonly options: RateLimiterOptions) {}

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextAvailableAt - now);
    this.nextAvailableAt = Math.max(now, this.nextAvailableAt) + this.options.minIntervalMs;
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    return fn();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
