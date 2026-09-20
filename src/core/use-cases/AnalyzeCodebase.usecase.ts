import type { CodeParser } from '../ports/CodeParser.port.js';
import type { LlmClient } from '../ports/LlmClient.port.js';
import type { AnalysisResult } from '../entities/AnalysisResult.js';

export interface AnalyzeCodebaseInput {
  targetPath: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  onProgress?: (message: string) => void;
}

/**
 * Orquesta: parseo AST del target -> chunking -> análisis semántico vía LLM
 * -> agregación de hallazgos. Depende solo de los puertos `CodeParser` y
 * `LlmClient`, nunca de sus implementaciones concretas (inversión de
 * dependencias).
 *
 * TODO(paso 2): implementar la orquestación real (parsing + chunking +
 * prompting + streaming). Por ahora queda scaffolded para validar el
 * cableado end-to-end del CLI.
 */
export class AnalyzeCodebaseUseCase {
  constructor(
    private readonly parser: CodeParser,
    private readonly llm: LlmClient,
  ) {}

  async execute(_input: AnalyzeCodebaseInput): Promise<AnalysisResult> {
    void this.parser;
    void this.llm;
    throw new Error(
      'AnalyzeCodebaseUseCase.execute() aún no está implementado — próximo paso del roadmap.',
    );
  }
}
