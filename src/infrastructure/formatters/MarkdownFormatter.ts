import type { OutputFormatter } from '../../core/ports/OutputFormatter.port.js';
import type { AnalysisResult } from '../../core/entities/AnalysisResult.js';
import type { RefactorSuggestion } from '../../core/entities/RefactorSuggestion.js';
import type { GeneratedTest } from '../../core/entities/GeneratedTest.js';

/** Formatter Markdown, pensado para pegar en descripciones de Pull Requests. */
export class MarkdownFormatter implements OutputFormatter {
  formatAnalysis(result: AnalysisResult): string {
    const lines = [`# Análisis: \`${result.targetPath}\``, '', result.summary];

    if (result.findings.length > 0) {
      lines.push('', '| Severidad | Categoría | Ubicación | Mensaje |', '| --- | --- | --- | --- |');
      for (const finding of result.findings) {
        const location = `${finding.location.filePath}:${finding.location.startLine}`;
        lines.push(`| ${finding.severity} | ${finding.category} | \`${location}\` | ${escapeCell(finding.message)} |`);
      }
    }

    return lines.join('\n');
  }

  formatRefactorSuggestions(suggestions: RefactorSuggestion[]): string {
    if (suggestions.length === 0) {
      return 'No se encontraron oportunidades de refactor.';
    }

    const lines = ['# Sugerencias de refactor', ''];
    for (const suggestion of suggestions) {
      lines.push(
        `## ${suggestion.filePath} — ${suggestion.title}`,
        '',
        `Confianza: ${suggestion.confidence.toFixed(2)}`,
        '',
        suggestion.rationale,
        '',
        '```diff',
        suggestion.diff.trimEnd(),
        '```',
        '',
      );
    }
    return lines.join('\n').trimEnd();
  }

  formatGeneratedTests(tests: GeneratedTest[]): string {
    if (tests.length === 0) {
      return 'No se generaron tests.';
    }
    const lines = ['# Tests generados', ''];
    for (const test of tests) {
      lines.push(`- \`${test.suggestedFilePath}\` (${test.framework}, ${test.unitIds.length} unidad(es) cubierta(s))`);
    }
    return lines.join('\n');
  }
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
