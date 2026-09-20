import { LlmError } from '../../shared/errors.js';

/**
 * Extrae el arreglo JSON de una respuesta de texto del LLM, tolerando que
 * venga envuelto en un bloque de markdown (\`\`\`json ... \`\`\`) o con texto
 * alrededor. Usado por los distintos parsers de respuesta (análisis,
 * refactor) para no duplicar esta heurística.
 */
export function extractJsonArray(rawText: string): string {
  const fencedMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(rawText);
  const candidate = fencedMatch ? fencedMatch[1]! : rawText;

  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new LlmError('La respuesta de Claude no contiene un arreglo JSON.');
  }
  return candidate.slice(start, end + 1);
}
