/**
 * Tipo de nodo AST que representa una unidad de código analizable de forma
 * independiente (lo que se envía como chunk al LLM).
 */
export type CodeUnitKind =
  | 'function'
  | 'method'
  | 'arrow-function'
  | 'class'
  | 'interface'
  | 'type-alias';

export interface SourceLocation {
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

/**
 * Fragmento de código extraído del AST (una función, método o clase) junto
 * con su ubicación exacta y una estimación de tokens, usado como unidad
 * mínima de análisis y de chunking hacia el LLM.
 */
export interface CodeUnit {
  id: string;
  kind: CodeUnitKind;
  name: string;
  sourceText: string;
  location: SourceLocation;
  estimatedTokens: number;
  /** Nombres de símbolos externos referenciados (imports, llamadas). */
  dependencies: string[];
}
