import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../../src/shared/rateLimiter.js';

describe('RateLimiter', () => {
  it('con minIntervalMs: 0, ejecuta las llamadas sin demora', async () => {
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    const start = Date.now();
    await limiter.schedule(() => Promise.resolve('a'));
    await limiter.schedule(() => Promise.resolve('b'));
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('espacia llamadas consecutivas al menos minIntervalMs', async () => {
    const limiter = new RateLimiter({ minIntervalMs: 50 });
    const start = Date.now();
    await limiter.schedule(() => Promise.resolve(1));
    await limiter.schedule(() => Promise.resolve(2));
    await limiter.schedule(() => Promise.resolve(3));
    expect(Date.now() - start).toBeGreaterThanOrEqual(95);
  });

  it('devuelve el valor resuelto por la función programada', async () => {
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    await expect(limiter.schedule(() => Promise.resolve(42))).resolves.toBe(42);
  });

  it('propaga el rechazo de la función programada', async () => {
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    await expect(limiter.schedule(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });
});
