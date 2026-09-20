import { z } from 'zod';
import type { CodeUnit } from '../entities/CodeUnit.js';
import type { RefactorSuggestion } from '../entities/RefactorSuggestion.js';
import { LlmError } from '../../shared/errors.js';
import { extractJsonArray } from './LlmJsonResponse.js';
import { generateUnifiedDiff } from './DiffGenerator.js';

export const REFACTOR_SYSTEM_PROMPT = `Sos un Staff Software Engineer refactorizando TypeScript.
Se te van a dar una o más unidades de código (funciones, métodos, clases) extraídas de un repositorio real.

Para cada unidad que valga la pena mejorar (legibilidad, duplicación, complejidad, naming, performance) proponé una versión refactorizada que PRESERVE EXACTAMENTE EL COMPORTAMIENTO Y LA FIRMA PÚBLICA (mismo nombre, mismos parámetros, mismo tipo de retorno). No refactorices unidades que ya están bien: es válido devolver un arreglo vacío.

Respondé ÚNICAMENTE con un arreglo JSON (sin texto adicional, sin explicación, sin bloque de markdown) donde cada elemento tiene EXACTAMENTE esta forma:
{"unitName": string, "title": string, "rationale": string, "refactoredCode": string, "confidence": number entre 0 y 1}

"refactoredCode" debe ser el reemplazo COMPLETO y sintácticamente válido de la unidad (sin comentarios explicando el cambio). "unitName" debe ser EXACTAMENTE uno de los nombres indicados en el mensaje del usuario.`;

export function buildRefactorUserPrompt(units: readonly CodeUnit[]): string {
  const blocks = units
    .map(
      (unit) =>
        `### ${unit.kind} "${unit.name}" (${unit.location.filePath}:${unit.location.startLine})\n\`\`\`typescript\n${unit.sourceText}\n\`\`\``,
    )
    .join('\n\n');

  return [
    `Proponé refactors para las siguientes ${units.length} unidad(es) de código TypeScript.`,
    `Nombres de unidad válidos para "unitName": ${units.map((u) => `"${u.name}"`).join(', ')}.`,
    '',
    blocks,
  ].join('\n');
}

const RefactorResponseItemSchema = z.object({
  unitName: z.string().min(1),
  title: z.string().min(1),
  rationale: z.string().min(1),
  refactoredCode: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const RefactorResponseSchema = z.array(RefactorResponseItemSchema);

/**
 * Parsea y valida la respuesta cruda de Claude para un chunk, mapea cada
 * sugerencia a su `CodeUnit` de origen (por nombre) y deriva el unified
 * diff con `generateUnifiedDiff` (determinista, no confiado al LLM).
 * Falla explícitamente ante JSON inválido, esquema incorrecto o una
 * unidad referenciada que no pertenece al chunk.
 */
export function parseRefactorResponse(rawText: string, units: readonly CodeUnit[]): RefactorSuggestion[] {
  const jsonText = extractJsonArray(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new LlmError('La respuesta de Claude no es JSON válido.', error);
  }

  const result = RefactorResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new LlmError(`La respuesta de Claude no cumple el esquema de refactors esperado: ${result.error.message}`);
  }

  const unitsByName = new Map(units.map((unit) => [unit.name, unit]));

  return result.data.map((item, index) => {
    const unit = unitsByName.get(item.unitName);
    if (!unit) {
      throw new LlmError(
        `Claude referenció "${item.unitName}" en unitName, que no es ninguna de las unidades analizadas en este chunk.`,
      );
    }
    return {
      id: `${unit.id}#refactor-${index}`,
      unitId: unit.id,
      filePath: unit.location.filePath,
      title: item.title,
      rationale: item.rationale,
      refactoredCode: item.refactoredCode,
      diff: generateUnifiedDiff(unit, item.refactoredCode),
      confidence: item.confidence,
    };
  });
}
