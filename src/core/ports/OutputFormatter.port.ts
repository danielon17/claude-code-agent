import type { AnalysisResult } from '../entities/AnalysisResult.js';
import type { RefactorSuggestion } from '../entities/RefactorSuggestion.js';
import type { GeneratedTest } from '../entities/GeneratedTest.js';

export const OUTPUT_FORMATS = ['text', 'json', 'markdown'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/**
 * Puerto de salida hacia la presentación de resultados. Permite añadir
 * nuevos formatos (texto enriquecido para terminal, JSON para CI, Markdown
 * para PRs) sin tocar los casos de uso.
 */
export interface OutputFormatter {
  formatAnalysis(result: AnalysisResult): string;
  formatRefactorSuggestions(suggestions: RefactorSuggestion[]): string;
  formatGeneratedTests(tests: GeneratedTest[]): string;
}
