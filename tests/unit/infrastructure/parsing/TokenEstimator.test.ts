import { describe, expect, it } from 'vitest';
import { estimateTokens } from '../../../../src/infrastructure/parsing/TokenEstimator.js';

describe('estimateTokens', () => {
  it('devuelve 0 para texto vacío', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('crece de forma proporcional a la longitud del texto', () => {
    const short = estimateTokens('const a = 1;');
    const long = estimateTokens('const a = 1;'.repeat(10));
    expect(long).toBeGreaterThan(short * 5);
  });

  it('redondea siempre hacia arriba (nunca subestima)', () => {
    expect(estimateTokens('a')).toBe(1);
  });
});
