import type { CodeParser } from '../ports/CodeParser.port.js';
import type { LlmClient } from '../ports/LlmClient.port.js';
import type { FileSystemPort } from '../ports/FileSystem.port.js';
import type { GeneratedTest, TestFramework } from '../entities/GeneratedTest.js';

export interface GenerateTestsInput {
  targetPath: string;
  framework: TestFramework;
  outputDir?: string;
  onProgress?: (message: string) => void;
}

/**
 * Orquesta: parseo -> generación de tests unitarios vía LLM para cada
 * `CodeUnit` exportada -> escritura en disco (o solo stdout, según CLI).
 *
 * TODO(paso 4): implementar prompting especializado para generación de
 * tests y escritura de archivos con `infrastructure/testgen/VitestTestWriter.ts`.
 */
export class GenerateTestsUseCase {
  constructor(
    private readonly parser: CodeParser,
    private readonly llm: LlmClient,
    private readonly fileSystem: FileSystemPort,
  ) {}

  async execute(_input: GenerateTestsInput): Promise<GeneratedTest[]> {
    void this.parser;
    void this.llm;
    void this.fileSystem;
    throw new Error(
      'GenerateTestsUseCase.execute() aún no está implementado — próximo paso del roadmap.',
    );
  }
}
