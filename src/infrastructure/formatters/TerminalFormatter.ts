import chalk from 'chalk';
import type { OutputFormatter } from '../../core/ports/OutputFormatter.port.js';
import type { AnalysisResult, Severity } from '../../core/entities/AnalysisResult.js';
import type { RefactorSuggestion } from '../../core/entities/RefactorSuggestion.js';
import type { GeneratedTest } from '../../core/entities/GeneratedTest.js';

const SEVERITY_PAINT: Record<Severity, (text: string) => string> = {
  critical: chalk.red.bold,
  warning: chalk.yellow,
  info: chalk.cyan,
};

/** Formatter para salida legible en terminal, con color por severidad. */
export class TerminalFormatter implements OutputFormatter {
  formatAnalysis(result: AnalysisResult): string {
    const lines = [chalk.bold(`Análisis de ${result.targetPath}`), result.summary];

    for (const finding of result.findings) {
      const paint = SEVERITY_PAINT[finding.severity];
      const location = `${finding.location.filePath}:${finding.location.startLine}`;
      lines.push('', paint(`[${finding.severity}] [${finding.category}] ${location}`), `  ${finding.message}`);
      if (finding.suggestion) {
        lines.push(chalk.dim(`  sugerencia: ${finding.suggestion}`));
      }
    }

    return lines.join('\n');
  }

  formatRefactorSuggestions(suggestions: RefactorSuggestion[]): string {
    if (suggestions.length === 0) {
      return chalk.dim('No se encontraron oportunidades de refactor.');
    }

    const lines: string[] = [];
    for (const suggestion of suggestions) {
      lines.push(
        chalk.bold(`[${suggestion.filePath}] ${suggestion.title} (confianza: ${suggestion.confidence.toFixed(2)})`),
        `  ${suggestion.rationale}`,
        suggestion.diff,
        '',
      );
    }
    return lines.join('\n').trimEnd();
  }

  formatGeneratedTests(tests: GeneratedTest[]): string {
    if (tests.length === 0) {
      return chalk.dim('No se generaron tests.');
    }
    return tests.map((test) => chalk.green(`✓ ${test.suggestedFilePath}`)).join('\n');
  }
}
