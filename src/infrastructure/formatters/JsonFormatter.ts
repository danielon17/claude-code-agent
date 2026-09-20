import type { OutputFormatter } from '../../core/ports/OutputFormatter.port.js';
import type { AnalysisResult } from '../../core/entities/AnalysisResult.js';
import type { RefactorSuggestion } from '../../core/entities/RefactorSuggestion.js';
import type { GeneratedTest } from '../../core/entities/GeneratedTest.js';

/** Formatter JSON estable, pensado para consumo por CI/CD u otras herramientas. */
export class JsonFormatter implements OutputFormatter {
  formatAnalysis(result: AnalysisResult): string {
    return JSON.stringify(result, null, 2);
  }

  formatRefactorSuggestions(suggestions: RefactorSuggestion[]): string {
    return JSON.stringify(suggestions, null, 2);
  }

  formatGeneratedTests(tests: GeneratedTest[]): string {
    return JSON.stringify(tests, null, 2);
  }
}
