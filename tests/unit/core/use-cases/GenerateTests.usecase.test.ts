import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GenerateTestsUseCase } from '../../../../src/core/use-cases/GenerateTests.usecase.js';
import { createFakeFileSystem, createFakeLlmClient, createFakeParser, makeCodeUnit } from '../../../helpers/fakes.js';

describe('GenerateTestsUseCase', () => {
  it('devuelve un arreglo vacío sin llamar al LLM si no hay unidades testeables', async () => {
    const parser = createFakeParser([makeCodeUnit({ name: 'Point', kind: 'interface' })]);
    const { llm, calls } = createFakeLlmClient([]);
    const fileSystem = createFakeFileSystem();
    const useCase = new GenerateTestsUseCase(parser, llm, fileSystem);

    const tests = await useCase.execute({ targetPath: '.', framework: 'vitest' });

    expect(tests).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('genera y escribe un archivo de test por archivo fuente, importando con ruta relativa', async () => {
    const sourceFilePath = path.join('repo', 'src', 'math.ts');
    const expectedTestFilePath = path.join('repo', 'src', 'math.generated.test.ts');
    const unit = makeCodeUnit({
      name: 'add',
      kind: 'function',
      location: { filePath: sourceFilePath, startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 },
    });
    const parser = createFakeParser([unit]);
    const response = JSON.stringify({
      testFileSourceCode: "import { add } from './math.js';\n\ntest('suma', () => { expect(add(1, 2)).toBe(3); });",
    });
    const { llm, calls } = createFakeLlmClient([response]);
    const fileSystem = createFakeFileSystem();
    const useCase = new GenerateTestsUseCase(parser, llm, fileSystem);

    const tests = await useCase.execute({ targetPath: '.', framework: 'vitest' });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.messages[0]?.content).toContain('./math.js');
    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatchObject({
      framework: 'vitest',
      suggestedFilePath: expectedTestFilePath,
      unitIds: [unit.id],
    });
    await expect(fileSystem.readFile(expectedTestFilePath)).resolves.toContain('suma');
  });

  it('agrupa las unidades por archivo: dos archivos producen dos llamadas al LLM', async () => {
    const unitA = makeCodeUnit({
      name: 'a',
      kind: 'function',
      location: { filePath: path.join('repo', 'a.ts'), startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 },
    });
    const unitB = makeCodeUnit({
      name: 'b',
      kind: 'arrow-function',
      location: { filePath: path.join('repo', 'b.ts'), startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 },
    });
    const parser = createFakeParser([unitA, unitB]);
    const response = JSON.stringify({ testFileSourceCode: 'test.skip("x", () => {});' });
    const { llm, calls } = createFakeLlmClient([response, response]);
    const fileSystem = createFakeFileSystem();
    const useCase = new GenerateTestsUseCase(parser, llm, fileSystem);

    const tests = await useCase.execute({ targetPath: '.', framework: 'vitest' });

    expect(calls).toHaveLength(2);
    expect(tests.map((t) => t.suggestedFilePath).sort()).toEqual(
      [path.join('repo', 'a.generated.test.ts'), path.join('repo', 'b.generated.test.ts')].sort(),
    );
  });

  it('respeta --output-dir para la ruta del archivo de test generado', async () => {
    const unit = makeCodeUnit({
      name: 'add',
      kind: 'function',
      location: {
        filePath: path.join('repo', 'src', 'math.ts'),
        startLine: 1,
        endLine: 1,
        startColumn: 1,
        endColumn: 1,
      },
    });
    const parser = createFakeParser([unit]);
    const response = JSON.stringify({ testFileSourceCode: 'test.skip("x", () => {});' });
    const { llm } = createFakeLlmClient([response]);
    const fileSystem = createFakeFileSystem();
    const useCase = new GenerateTestsUseCase(parser, llm, fileSystem);
    const outputDir = path.join('repo', 'tests');

    const tests = await useCase.execute({ targetPath: '.', framework: 'vitest', outputDir });

    expect(tests[0]?.suggestedFilePath).toBe(path.join(outputDir, 'math.generated.test.ts'));
  });

  it('ignora unidades no testeables directamente (interfaces, type aliases, métodos)', async () => {
    const units = [
      makeCodeUnit({ name: 'Point', kind: 'interface' }),
      makeCodeUnit({ name: 'Id', kind: 'type-alias' }),
      makeCodeUnit({ name: 'Calculator.add', kind: 'method' }),
    ];
    const parser = createFakeParser(units);
    const { llm, calls } = createFakeLlmClient([]);
    const fileSystem = createFakeFileSystem();
    const useCase = new GenerateTestsUseCase(parser, llm, fileSystem);

    const tests = await useCase.execute({ targetPath: '.', framework: 'vitest' });

    expect(tests).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
