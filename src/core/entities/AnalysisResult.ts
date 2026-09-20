import type { SourceLocation } from './CodeUnit.js';

export type Severity = 'info' | 'warning' | 'critical';

export type FindingCategory =
  | 'complexity'
  | 'duplication'
  | 'naming'
  | 'security'
  | 'performance'
  | 'maintainability';

export interface AnalysisFinding {
  id: string;
  unitId: string;
  severity: Severity;
  category: FindingCategory;
  message: string;
  suggestion?: string;
  location: SourceLocation;
}

/**
 * Resultado agregado de analizar un archivo o directorio: hallazgos por
 * unidad de código más un resumen generado por el LLM.
 */
export interface AnalysisResult {
  targetPath: string;
  analyzedAt: string;
  unitsAnalyzed: number;
  findings: AnalysisFinding[];
  summary: string;
}
