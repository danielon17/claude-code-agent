import { LlmError } from '../../shared/errors.js';

function extractJsonBlock(rawText: string, open: string, close: string): string {
  const fencedMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(rawText);
  const candidate = fencedMatch ? fencedMatch[1]! : rawText;

  const start = candidate.indexOf(open);
  const end = candidate.lastIndexOf(close);
  if (start === -1 || end === -1 || end < start) {
    throw new LlmError(`La respuesta de Claude no contiene un${open === '[' ? ' arreglo' : ' objeto'} JSON.`);
  }
  return candidate.slice(start, end + 1);
}

/**
 * Extrae el arreglo JSON de una respuesta de texto del LLM, tolerando que
 * venga envuelto en un bloque de markdown (\`\`\`json ... \`\`\`) o con texto
 * alrededor. Usado por los parsers de respuesta basados en listas
 * (análisis, refactor).
 */
export function extractJsonArray(rawText: string): string {
  return extractJsonBlock(rawText, '[', ']');
}

/** Igual que `extractJsonArray`, pero para una respuesta con forma de objeto (p.ej. generación de tests). */
export function extractJsonObject(rawText: string): string {
  return extractJsonBlock(rawText, '{', '}');
}
