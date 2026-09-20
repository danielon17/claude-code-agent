import { describe, expect, it } from 'vitest';
import { RefactorCodeUseCase } from '../../../../src/core/use-cases/RefactorCode.usecase.js';
import { createFakeFileSystem, createFakeLlmClient, createFakeParser, makeCodeUnit } from '../../../helpers/fakes.js';

describe('RefactorCodeUseCase', () => {
  it('devuelve un resultado vacío sin llamar al LLM si el parser no encuentra unidades', async () => {
    const parser = createFakeParser([]);
    const { llm, calls } = createFakeLlmClient([]);
    const fileSystem = createFakeFileSystem();
    const useCase = new RefactorCodeUseCase(parser, llm, fileSystem);

    const result = await useCase.execute({ targetPath: '.', apply: false });

    expect(result).toEqual({ suggestions: [], appliedCount: 0 });
    expect(calls).toHaveLength(0);
  });

  it('en modo dry-run (apply: false) genera sugerencias pero no escribe archivos', async () => {
    const unit = makeCodeUnit({
      name: 'add',
      sourceText: 'function add(a,b){return a+b}',
      location: { filePath: '/repo/math.ts', startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 },
    });
    const parser = createFakeParser([unit]);
    const response = JSON.stringify([
      {
        unitName: 'add',
        title: 'Formatear',
        rationale: 'Legibilidad.',
        refactoredCode: 'function add(a, b) {\n  return a + b;\n}',
        confidence: 0.8,
      },
    ]);
    const { llm } = createFakeLlmClient([response]);
    const fileSystem = createFakeFileSystem({ '/repo/math.ts': 'function add(a,b){return a+b}' });
    const useCase = new RefactorCodeUseCase(parser, llm, fileSystem);

    const result = await useCase.execute({ targetPath: '.', apply: false });

    expect(result.suggestions).toHaveLength(1);
    expect(result.appliedCount).toBe(0);
    await expect(fileSystem.readFile('/repo/math.ts')).resolves.toBe('function add(a,b){return a+b}');
  });

  it('con apply: true escribe el refactor en el archivo, en la ubicación exacta de la unidad', async () => {
    const originalFile = ['export function add(a, b) {', '  return a + b;', '}', '', 'export const x = 1;'].join('\n');
    const unit = makeCodeUnit({
      name: 'add',
      sourceText: 'export function add(a, b) {\n  return a + b;\n}',
      location: { filePath: '/repo/math.ts', startLine: 1, endLine: 3, startColumn: 1, endColumn: 2 },
    });
    const parser = createFakeParser([unit]);
    const response = JSON.stringify([
      {
        unitName: 'add',
        title: 'Sumar con validación',
        rationale: 'Evitar NaN.',
        refactoredCode: 'export function add(a, b) {\n  return Number(a) + Number(b);\n}',
        confidence: 0.7,
      },
    ]);
    const { llm } = createFakeLlmClient([response]);
    const fileSystem = createFakeFileSystem({ '/repo/math.ts': originalFile });
    const useCase = new RefactorCodeUseCase(parser, llm, fileSystem);

    const result = await useCase.execute({ targetPath: '.', apply: true });

    expect(result.appliedCount).toBe(1);
    const written = await fileSystem.readFile('/repo/math.ts');
    expect(written).toBe(
      ['export function add(a, b) {', '  return Number(a) + Number(b);', '}', '', 'export const x = 1;'].join('\n'),
    );
  });

  it('con apply: true y sin sugerencias, no escribe ningún archivo', async () => {
    const unit = makeCodeUnit({ name: 'ok' });
    const parser = createFakeParser([unit]);
    const { llm } = createFakeLlmClient(['[]']);
    const fileSystem = createFakeFileSystem({ 'fixture.ts': 'function ok() {}' });
    const useCase = new RefactorCodeUseCase(parser, llm, fileSystem);

    const result = await useCase.execute({ targetPath: '.', apply: true });

    expect(result).toEqual({ suggestions: [], appliedCount: 0 });
  });
});
