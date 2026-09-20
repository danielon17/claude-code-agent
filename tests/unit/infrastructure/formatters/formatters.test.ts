import { describe, expect, it } from 'vitest';
import { createFormatter } from '../../../../src/infrastructure/formatters/createFormatter.js';
import { TerminalFormatter } from '../../../../src/infrastructure/formatters/TerminalFormatter.js';
import { JsonFormatter } from '../../../../src/infrastructure/formatters/JsonFormatter.js';
import { MarkdownFormatter } from '../../../../src/infrastructure/formatters/MarkdownFormatter.js';
import type { AnalysisResult } from '../../../../src/core/entities/AnalysisResult.js';
import type { RefactorSuggestion } from '../../../../src/core/entities/RefactorSuggestion.js';
import type { GeneratedTest } from '../../../../src/core/entities/GeneratedTest.js';

const analysisResult: AnalysisResult = {
  targetPath: './src',
  analyzedAt: '2026-01-01T00:00:00.000Z',
  unitsAnalyzed: 2,
  findings: [
    {
      id: 'f1',
      unitId: 'u1',
      severity: 'critical',
      category: 'security',
      message: 'Inyección posible | riesgo alto',
      suggestion: 'Sanitizar input',
      location: { filePath: 'src/a.ts', startLine: 10, endLine: 12, startColumn: 1, endColumn: 2 },
    },
  ],
  summary: '1 hallazgo crítico.',
};

const refactorSuggestions: RefactorSuggestion[] = [
  {
    id: 'r1',
    unitId: 'u1',
    filePath: 'src/a.ts',
    title: 'Simplificar condicional',
    rationale: 'Reduce complejidad ciclomática.',
    refactoredCode: 'function a() {}',
    diff: '--- a\n+++ b\n@@\n-old\n+new',
    confidence: 0.85,
  },
];

const generatedTests: GeneratedTest[] = [
  { id: 't1', unitIds: ['u1'], framework: 'vitest', suggestedFilePath: 'src/a.generated.test.ts', sourceCode: 'test()' },
];

describe('createFormatter', () => {
  it('resuelve text -> TerminalFormatter, json -> JsonFormatter, markdown -> MarkdownFormatter', () => {
    expect(createFormatter('text')).toBeInstanceOf(TerminalFormatter);
    expect(createFormatter('json')).toBeInstanceOf(JsonFormatter);
    expect(createFormatter('markdown')).toBeInstanceOf(MarkdownFormatter);
  });
});

describe('TerminalFormatter', () => {
  const formatter = new TerminalFormatter();

  it('formatAnalysis incluye severidad, categoría, ubicación y sugerencia', () => {
    const text = formatter.formatAnalysis(analysisResult);
    expect(text).toContain('critical');
    expect(text).toContain('src/a.ts:10');
    expect(text).toContain('Sanitizar input');
  });

  it('formatRefactorSuggestions muestra un mensaje claro si no hay sugerencias', () => {
    expect(formatter.formatRefactorSuggestions([])).toMatch(/no se encontraron/i);
  });

  it('formatGeneratedTests lista los archivos generados', () => {
    expect(formatter.formatGeneratedTests(generatedTests)).toContain('src/a.generated.test.ts');
  });
});

describe('JsonFormatter', () => {
  const formatter = new JsonFormatter();

  it('produce JSON parseable que reconstruye el resultado original', () => {
    const parsed = JSON.parse(formatter.formatAnalysis(analysisResult));
    expect(parsed).toEqual(analysisResult);
  });

  it('formatRefactorSuggestions produce un arreglo JSON válido', () => {
    expect(JSON.parse(formatter.formatRefactorSuggestions(refactorSuggestions))).toEqual(refactorSuggestions);
  });
});

describe('MarkdownFormatter', () => {
  const formatter = new MarkdownFormatter();

  it('formatAnalysis genera una tabla Markdown con el pipe escapado', () => {
    const md = formatter.formatAnalysis(analysisResult);
    expect(md).toContain('| critical | security |');
    expect(md).toContain('Inyección posible \\| riesgo alto');
  });

  it('formatRefactorSuggestions incluye el diff en un bloque de código', () => {
    const md = formatter.formatRefactorSuggestions(refactorSuggestions);
    expect(md).toContain('```diff');
    expect(md).toContain('Simplificar condicional');
  });

  it('formatGeneratedTests lista archivo y framework', () => {
    expect(formatter.formatGeneratedTests(generatedTests)).toContain('vitest');
  });
});
