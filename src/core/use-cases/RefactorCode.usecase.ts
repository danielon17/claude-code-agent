import type { CodeParser } from '../ports/CodeParser.port.js';
import type { LlmClient } from '../ports/LlmClient.port.js';
import type { FileSystemPort } from '../ports/FileSystem.port.js';
import type { RefactorSuggestion } from '../entities/RefactorSuggestion.js';

export interface RefactorCodeInput {
  targetPath: string;
  /** Si es `true`, aplica los parches generados directamente sobre el archivo. */
  apply: boolean;
  onProgress?: (message: string) => void;
}

export interface RefactorCodeOutput {
  suggestions: RefactorSuggestion[];
  appliedCount: number;
}

/**
 * Orquesta: parseo -> generación de sugerencias de refactor vía LLM ->
 * (opcional) aplicación del diff sobre el árbol de archivos real.
 *
 * TODO(paso 3): implementar generación de diffs y aplicación con
 * `infrastructure/diff/DiffGenerator.ts`.
 */
export class RefactorCodeUseCase {
  constructor(
    private readonly parser: CodeParser,
    private readonly llm: LlmClient,
    private readonly fileSystem: FileSystemPort,
  ) {}

  async execute(_input: RefactorCodeInput): Promise<RefactorCodeOutput> {
    void this.parser;
    void this.llm;
    void this.fileSystem;
    throw new Error(
      'RefactorCodeUseCase.execute() aún no está implementado — próximo paso del roadmap.',
    );
  }
}
