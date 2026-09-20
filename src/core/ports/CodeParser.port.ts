import type { CodeUnit } from '../entities/CodeUnit.js';

export interface ParseOptions {
  includePatterns?: string[];
  excludePatterns?: string[];
  maxFileSizeBytes?: number;
}

/**
 * Puerto de salida hacia el motor de parsing estático. El adaptador de
 * infraestructura (`TsCompilerParser`) lo implementa usando la TypeScript
 * Compiler API para extraer el AST y producir `CodeUnit[]`.
 */
export interface CodeParser {
  parseFile(filePath: string): Promise<CodeUnit[]>;
  parseDirectory(dirPath: string, options?: ParseOptions): Promise<CodeUnit[]>;
}
