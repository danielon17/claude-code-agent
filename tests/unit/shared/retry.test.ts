import { describe, expect, it, vi } from 'vitest';
import { calculateBackoffDelayMs, withRetry } from '../../../src/shared/retry.js';

describe('calculateBackoffDelayMs', () => {
  it('crece exponencialmente con el número de intento', () => {
    const d1 = calculateBackoffDelayMs(1, { initialDelayMs: 100, maxDelayMs: 100_000 });
    const d2 = calculateBackoffDelayMs(2, { initialDelayMs: 100, maxDelayMs: 100_000 });
    const d3 = calculateBackoffDelayMs(3, { initialDelayMs: 100, maxDelayMs: 100_000 });
    expect(d1).toBeGreaterThanOrEqual(100);
    expect(d2).toBeGreaterThan(d1 * 1.5);
    expect(d3).toBeGreaterThan(d2 * 1.5);
  });

  it('nunca supera maxDelayMs (más hasta un 20% de jitter)', () => {
    const delay = calculateBackoffDelayMs(10, { initialDelayMs: 100, maxDelayMs: 1000 });
    expect(delay).toBeLessThanOrEqual(1200);
  });
});

describe('withRetry', () => {
  it('devuelve el resultado sin reintentar si la primera llamada tiene éxito', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reintenta hasta tener éxito, respetando maxAttempts', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail 1')).mockRejectedValueOnce(new Error('fail 2')).mockResolvedValue('ok');
    const onRetry = vi.fn();
    await expect(withRetry(fn, { maxAttempts: 5, initialDelayMs: 1, maxDelayMs: 2, onRetry })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('propaga el error tras agotar maxAttempts', async () => {
    const error = new Error('siempre falla');
    const fn = vi.fn().mockRejectedValue(error);
    await expect(withRetry(fn, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 2 })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('no reintenta si isRetryable devuelve false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('no reintentable'));
    await expect(withRetry(fn, { maxAttempts: 5, isRetryable: () => false })).rejects.toThrow('no reintentable');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
