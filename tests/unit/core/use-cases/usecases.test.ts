import { describe, expect, it } from 'vitest';
import { AnalyzeCodebaseUseCase } from '../../../../src/core/use-cases/AnalyzeCodebase.usecase.js';
import { RefactorCodeUseCase } from '../../../../src/core/use-cases/RefactorCode.usecase.js';
import { GenerateTestsUseCase } from '../../../../src/core/use-cases/GenerateTests.usecase.js';
import type { CodeParser } from '../../../../src/core/ports/CodeParser.port.js';
import type { LlmClient } from '../../../../src/core/ports/LlmClient.port.js';
import type { FileSystemPort } from '../../../../src/core/ports/FileSystem.port.js';

// Dobles de prueba mínimos: estos use cases aún no invocan ningún método de
// sus dependencias (están scaffolded para el paso 3), así que basta con que
// satisfagan el tipo del puerto.
const parserStub: CodeParser = {
  parseFile: () => Promise.reject(new Error('no debería llamarse todavía')),
  parseDirectory: () => Promise.reject(new Error('no debería llamarse todavía')),
};

const llmStub: LlmClient = {
  streamCompletion: () => {
    throw new Error('no debería llamarse todavía');
  },
  complete: () => Promise.reject(new Error('no debería llamarse todavía')),
  countTokens: () => Promise.reject(new Error('no debería llamarse todavía')),
};

const fileSystemStub: FileSystemPort = {
  readFile: () => Promise.reject(new Error('no debería llamarse todavía')),
  writeFile: () => Promise.reject(new Error('no debería llamarse todavía')),
  exists: () => Promise.reject(new Error('no debería llamarse todavía')),
  isDirectory: () => Promise.reject(new Error('no debería llamarse todavía')),
};

describe('use cases scaffolded (pendientes de implementación)', () => {
  it('AnalyzeCodebaseUseCase.execute() rechaza indicando que falta implementar', async () => {
    const useCase = new AnalyzeCodebaseUseCase(parserStub, llmStub);
    await expect(useCase.execute({ targetPath: '.' })).rejects.toThrow(/no está implementado/);
  });

  it('RefactorCodeUseCase.execute() rechaza indicando que falta implementar', async () => {
    const useCase = new RefactorCodeUseCase(parserStub, llmStub, fileSystemStub);
    await expect(useCase.execute({ targetPath: '.', apply: false })).rejects.toThrow(/no está implementado/);
  });

  it('GenerateTestsUseCase.execute() rechaza indicando que falta implementar', async () => {
    const useCase = new GenerateTestsUseCase(parserStub, llmStub, fileSystemStub);
    await expect(useCase.execute({ targetPath: '.', framework: 'vitest' })).rejects.toThrow(/no está implementado/);
  });
});
