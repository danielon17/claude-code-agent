/**
 * Sugerencia de refactorización generada por el LLM para una `CodeUnit`.
 * `refactoredCode` es el reemplazo completo de la unidad (lo que se
 * escribe al archivo con `--apply`, ubicándolo por línea vía la
 * `SourceLocation` de la unidad original); `diff` es la misma sugerencia
 * expresada como unified diff, derivada de `refactoredCode` para mostrarla
 * en la terminal o pegarla en una PR.
 */
export interface RefactorSuggestion {
  id: string;
  unitId: string;
  filePath: string;
  title: string;
  rationale: string;
  refactoredCode: string;
  diff: string;
  /** Confianza del modelo en la sugerencia, de 0 a 1. */
  confidence: number;
}
