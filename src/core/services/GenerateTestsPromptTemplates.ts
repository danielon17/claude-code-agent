import { z } from 'zod';
import type { CodeUnit } from '../entities/CodeUnit.js';
import type { TestFramework } from '../entities/GeneratedTest.js';
import { LlmError } from '../../shared/errors.js';
import { extractJsonObject } from './LlmJsonResponse.js';

export function buildGenerateTestsSystemPrompt(framework: TestFramework): string {
  const importLine =
    framework === 'vitest'
      ? "import { describe, it, expect } from 'vitest';"
      : "import { describe, it, expect } from '@jest/globals';";

  return `Sos un Staff Software Engineer escribiendo tests unitarios en TypeScript con ${framework}.
Se te van a dar una o más funciones exportadas de UN MISMO archivo TypeScript, junto con la ruta relativa desde la que importarlas.

Escribí un único archivo de test que:
- Empiece con "${importLine}" seguido del import de las funciones a testear desde la ruta indicada.
- Cubra el happy path y al menos un edge case por función.
- Use nombres de test descriptivos, sin comentarios explicando lo obvio.
- Sea TypeScript válido y autocontenido, sin mocks externos salvo que sea estrictamente necesario.

Respondé ÚNICAMENTE con un objeto JSON (sin texto adicional, sin bloque de markdown) con esta forma EXACTA:
{"testFileSourceCode": string}`;
}

export function buildGenerateTestsUserPrompt(units: readonly CodeUnit[], importPath: string): string {
  const blocks = units
    .map((unit) => `### ${unit.kind} "${unit.name}"\n\`\`\`typescript\n${unit.sourceText}\n\`\`\``)
    .join('\n\n');

  return [
    `Generá tests para las siguientes ${units.length} función(es), importándolas desde "${importPath}".`,
    '',
    blocks,
  ].join('\n');
}

const GenerateTestsResponseSchema = z.object({ testFileSourceCode: z.string().min(1) });

/** Parsea y valida la respuesta cruda de Claude, devolviendo el código fuente del archivo de test. */
export function parseGenerateTestsResponse(rawText: string): string {
  const jsonText = extractJsonObject(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new LlmError('La respuesta de Claude no es JSON válido.', error);
  }

  const result = GenerateTestsResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new LlmError(`La respuesta de Claude no cumple el esquema esperado: ${result.error.message}`);
  }
  return result.data.testFileSourceCode;
}
