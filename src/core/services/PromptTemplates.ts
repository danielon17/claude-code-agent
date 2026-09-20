import { z } from 'zod';
import type { CodeUnit } from '../entities/CodeUnit.js';
import type { AnalysisFinding } from '../entities/AnalysisResult.js';
import { LlmError } from '../../shared/errors.js';
import { extractJsonArray } from './LlmJsonResponse.js';

export const ANALYSIS_SYSTEM_PROMPT = `Sos un Staff Software Engineer haciendo code review de TypeScript.
Se te van a dar una o más unidades de código (funciones, métodos, clases, interfaces, type aliases) extraídas de un repositorio real.

Analizá cada unidad buscando problemas reales de: complejidad, duplicación, naming, seguridad, performance y mantenibilidad. No inventes problemas que no existen; si una unidad está bien, no reportes nada sobre ella.

Respondé ÚNICAMENTE con un arreglo JSON (sin texto adicional, sin explicación, sin bloque de markdown) donde cada elemento tiene EXACTAMENTE esta forma:
{"unitName": string, "severity": "info" | "warning" | "critical", "category": "complexity" | "duplication" | "naming" | "security" | "performance" | "maintainability", "message": string, "suggestion": string opcional}

"unitName" debe ser EXACTAMENTE uno de los nombres de unidad indicados en el mensaje del usuario. Si no hay hallazgos, respondé con un arreglo vacío: []`;

export function buildAnalysisUserPrompt(units: readonly CodeUnit[]): string {
  const blocks = units
    .map(
      (unit) =>
        `### ${unit.kind} "${unit.name}" (${unit.location.filePath}:${unit.location.startLine})\n\`\`\`typescript\n${unit.sourceText}\n\`\`\``,
    )
    .join('\n\n');

  return [
    `Analizá las siguientes ${units.length} unidad(es) de código TypeScript.`,
    `Nombres de unidad válidos para "unitName": ${units.map((u) => `"${u.name}"`).join(', ')}.`,
    '',
    blocks,
  ].join('\n');
}

const FindingResponseSchema = z.object({
  unitName: z.string().min(1),
  severity: z.enum(['info', 'warning', 'critical']),
  category: z.enum(['complexity', 'duplication', 'naming', 'security', 'performance', 'maintainability']),
  message: z.string().min(1),
  suggestion: z.string().min(1).optional(),
});

const FindingsResponseSchema = z.array(FindingResponseSchema);

/**
 * Parsea y valida la respuesta cruda de Claude para un chunk, mapeando
 * cada hallazgo a su `CodeUnit` de origen (por nombre) para recuperar
 * `unitId` y `location`. Falla explícitamente (en vez de degradar
 * silenciosamente) ante JSON inválido, esquema incorrecto o una unidad
 * referenciada que no pertenece al chunk: una respuesta que no se puede
 * confiar no debería producir hallazgos parciales silenciosos.
 */
export function parseFindingsResponse(rawText: string, units: readonly CodeUnit[]): AnalysisFinding[] {
  const jsonText = extractJsonArray(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new LlmError('La respuesta de Claude no es JSON válido.', error);
  }

  const result = FindingsResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new LlmError(`La respuesta de Claude no cumple el esquema de hallazgos esperado: ${result.error.message}`);
  }

  const unitsByName = new Map(units.map((unit) => [unit.name, unit]));

  return result.data.map((finding, index) => {
    const unit = unitsByName.get(finding.unitName);
    if (!unit) {
      throw new LlmError(
        `Claude referenció "${finding.unitName}" en unitName, que no es ninguna de las unidades analizadas en este chunk.`,
      );
    }
    return {
      id: `${unit.id}#finding-${index}`,
      unitId: unit.id,
      severity: finding.severity,
      category: finding.category,
      message: finding.message,
      suggestion: finding.suggestion,
      location: unit.location,
    };
  });
}
