import type { CodeUnit } from '../entities/CodeUnit.js';

export interface CodeChunk {
  units: CodeUnit[];
  totalTokens: number;
}

export interface ChunkOptions {
  /** Presupuesto de tokens por chunk (excluyendo el system prompt). */
  maxTokensPerChunk: number;
}

/**
 * Agrupa `CodeUnit[]` en chunks que respetan `maxTokensPerChunk`, llenando
 * cada uno de forma voraz en el orden recibido. Nunca divide una unidad:
 * una función que por sí sola exceda el límite ocupa su propio chunk
 * (mejor exceder el presupuesto en un caso raro que enviar al LLM una
 * función cortada a la mitad, que produciría análisis sin sentido).
 */
export function chunkCodeUnits(units: readonly CodeUnit[], options: ChunkOptions): CodeChunk[] {
  const { maxTokensPerChunk } = options;
  if (maxTokensPerChunk <= 0) {
    throw new RangeError('maxTokensPerChunk debe ser mayor que cero');
  }

  const chunks: CodeChunk[] = [];
  let currentUnits: CodeUnit[] = [];
  let currentTokens = 0;

  const flush = (): void => {
    if (currentUnits.length > 0) {
      chunks.push({ units: currentUnits, totalTokens: currentTokens });
      currentUnits = [];
      currentTokens = 0;
    }
  };

  for (const unit of units) {
    const wouldExceedBudget = currentTokens > 0 && currentTokens + unit.estimatedTokens > maxTokensPerChunk;
    if (wouldExceedBudget) {
      flush();
    }
    currentUnits.push(unit);
    currentTokens += unit.estimatedTokens;
  }
  flush();

  return chunks;
}
