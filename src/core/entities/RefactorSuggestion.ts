/**
 * Sugerencia de refactorización generada por el LLM, expresada como un
 * parche en formato unified diff aplicable directamente sobre el archivo
 * de origen.
 */
export interface RefactorSuggestion {
  id: string;
  unitId: string;
  filePath: string;
  title: string;
  rationale: string;
  /** Parche en formato unified diff (compatible con `git apply`). */
  diff: string;
  /** Confianza del modelo en la sugerencia, de 0 a 1. */
  confidence: number;
}
