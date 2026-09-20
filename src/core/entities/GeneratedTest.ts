export type TestFramework = 'vitest' | 'jest';

/**
 * Archivo de test generado por el LLM a partir de una o más `CodeUnit` del
 * mismo archivo fuente, listo para escribirse en disco.
 */
export interface GeneratedTest {
  id: string;
  unitIds: string[];
  framework: TestFramework;
  /** Ruta sugerida para el archivo de test (ej: `src/foo.generated.test.ts`). */
  suggestedFilePath: string;
  sourceCode: string;
}
