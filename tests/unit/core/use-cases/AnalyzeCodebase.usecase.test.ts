import { describe, expect, it } from 'vitest';
import { AnalyzeCodebaseUseCase } from '../../../../src/core/use-cases/AnalyzeCodebase.usecase.js';
import { LlmError } from '../../../../src/shared/errors.js';
import { createFakeLlmClient, createFakeParser, makeCodeUnit } from '../../../helpers/fakes.js';

describe('AnalyzeCodebaseUseCase', () => {
  it('devuelve un resultado vacío sin llamar al LLM si el parser no encuentra unidades', async () => {
    const parser = createFakeParser([]);
    const { llm, calls } = createFakeLlmClient([]);
    const useCase = new AnalyzeCodebaseUseCase(parser, llm);

    const result = await useCase.execute({ targetPath: '.' });

    expect(result.unitsAnalyzed).toBe(0);
    expect(result.findings).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('parsea, chunkea y mapea los hallazgos del LLM a las unidades correctas', async () => {
    const units = [
      makeCodeUnit({ name: 'add', estimatedTokens: 10 }),
      makeCodeUnit({ name: 'Calculator.add', estimatedTokens: 10 }),
    ];
    const parser = createFakeParser(units);
    const response = JSON.stringify([
      {
        unitName: 'add',
        severity: 'warning',
        category: 'complexity',
        message: 'Función un poco larga.',
        suggestion: 'Extraer una función auxiliar.',
      },
    ]);
    const { llm, calls } = createFakeLlmClient([response]);
    const useCase = new AnalyzeCodebaseUseCase(parser, llm);

    const progressMessages: string[] = [];
    const tokens: string[] = [];

    const result = await useCase.execute({
      targetPath: '.',
      maxTokensPerChunk: 1000,
      onProgress: (message) => progressMessages.push(message),
      onToken: (text) => tokens.push(text),
    });

    expect(calls).toHaveLength(1);
    expect(result.unitsAnalyzed).toBe(2);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      unitId: units[0]?.id,
      severity: 'warning',
      category: 'complexity',
      message: 'Función un poco larga.',
    });
    expect(result.summary).toContain('1 hallazgo');
    expect(progressMessages.some((m) => m.includes('chunk 1/1'))).toBe(true);
    expect(tokens.join('')).toBe(response);
  });

  it('hace una llamada al LLM por cada chunk cuando el presupuesto de tokens fuerza varios chunks', async () => {
    const units = [
      makeCodeUnit({ name: 'a', estimatedTokens: 900 }),
      makeCodeUnit({ name: 'b', estimatedTokens: 900 }),
    ];
    const parser = createFakeParser(units);
    const { llm, calls } = createFakeLlmClient(['[]', '[]']);
    const useCase = new AnalyzeCodebaseUseCase(parser, llm);

    const result = await useCase.execute({ targetPath: '.', maxTokensPerChunk: 1000 });

    expect(calls).toHaveLength(2);
    expect(result.findings).toEqual([]);
    expect(result.summary).toContain('no se encontraron problemas');
  });

  it('rechaza con LlmError si la respuesta del modelo referencia una unidad desconocida', async () => {
    const units = [makeCodeUnit({ name: 'add' })];
    const parser = createFakeParser(units);
    const response = JSON.stringify([
      { unitName: 'unidad-inexistente', severity: 'info', category: 'naming', message: 'x' },
    ]);
    const { llm } = createFakeLlmClient([response]);
    const useCase = new AnalyzeCodebaseUseCase(parser, llm);

    await expect(useCase.execute({ targetPath: '.' })).rejects.toBeInstanceOf(LlmError);
  });
});
