export type TestFramework = 'vitest' | 'jest';

/**
 * Archivo de test generado por el LLM a partir de una `CodeUnit`, listo
 * para escribirse en disco junto al código fuente analizado.
 */
export interface GeneratedTest {
  id: string;
  unitId: string;
  framework: TestFramework;
  /** Ruta sugerida para el archivo de test (ej: `src/foo.test.ts`). */
  suggestedFilePath: string;
  sourceCode: string;
}
