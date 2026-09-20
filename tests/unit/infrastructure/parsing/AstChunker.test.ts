import { describe, expect, it } from 'vitest';
import { chunkCodeUnits } from '../../../../src/infrastructure/parsing/AstChunker.js';
import type { CodeUnit } from '../../../../src/core/entities/CodeUnit.js';

function makeUnit(name: string, estimatedTokens: number): CodeUnit {
  return {
    id: `fixture.ts#${name}`,
    kind: 'function',
    name,
    sourceText: `function ${name}() {}`,
    location: { filePath: 'fixture.ts', startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 },
    estimatedTokens,
    dependencies: [],
  };
}

describe('chunkCodeUnits', () => {
  it('agrupa varias unidades pequeñas en un solo chunk si caben en el presupuesto', () => {
    const units = [makeUnit('a', 100), makeUnit('b', 100), makeUnit('c', 100)];
    const chunks = chunkCodeUnits(units, { maxTokensPerChunk: 1000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.units).toHaveLength(3);
    expect(chunks[0]?.totalTokens).toBe(300);
  });

  it('abre un nuevo chunk cuando la siguiente unidad excedería el presupuesto', () => {
    const units = [makeUnit('a', 600), makeUnit('b', 600)];
    const chunks = chunkCodeUnits(units, { maxTokensPerChunk: 1000 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.units.map((u) => u.name)).toEqual(['a']);
    expect(chunks[1]?.units.map((u) => u.name)).toEqual(['b']);
  });

  it('nunca divide una unidad: una unidad más grande que el presupuesto ocupa su propio chunk', () => {
    const units = [makeUnit('huge', 5000)];
    const chunks = chunkCodeUnits(units, { maxTokensPerChunk: 1000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.units).toHaveLength(1);
    expect(chunks[0]?.totalTokens).toBe(5000);
  });

  it('preserva el orden original de las unidades dentro y entre chunks', () => {
    const units = [makeUnit('a', 900), makeUnit('b', 900), makeUnit('c', 100)];
    const chunks = chunkCodeUnits(units, { maxTokensPerChunk: 1000 });
    const order = chunks.flatMap((chunk) => chunk.units.map((u) => u.name));
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('devuelve un arreglo vacío si no hay unidades', () => {
    expect(chunkCodeUnits([], { maxTokensPerChunk: 1000 })).toEqual([]);
  });

  it('lanza si el presupuesto de tokens no es positivo', () => {
    expect(() => chunkCodeUnits([makeUnit('a', 10)], { maxTokensPerChunk: 0 })).toThrow(RangeError);
  });
});
