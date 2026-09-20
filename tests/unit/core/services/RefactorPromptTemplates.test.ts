import { describe, expect, it } from 'vitest';
import { buildRefactorUserPrompt, parseRefactorResponse } from '../../../../src/core/services/RefactorPromptTemplates.js';
import { LlmError } from '../../../../src/shared/errors.js';
import { makeCodeUnit } from '../../../helpers/fakes.js';

describe('buildRefactorUserPrompt', () => {
  it('incluye el nombre y el código fuente de cada unidad', () => {
    const unit = makeCodeUnit({ name: 'add', sourceText: 'function add() {}' });
    const prompt = buildRefactorUserPrompt([unit]);
    expect(prompt).toContain('"add"');
    expect(prompt).toContain('function add() {}');
  });
});

describe('parseRefactorResponse', () => {
  const unit = makeCodeUnit({ name: 'add', sourceText: 'function add(a,b){return a+b}' });

  it('parsea una sugerencia válida y deriva su unified diff', () => {
    const response = JSON.stringify([
      {
        unitName: 'add',
        title: 'Agregar espacios',
        rationale: 'Legibilidad.',
        refactoredCode: 'function add(a, b) {\n  return a + b;\n}',
        confidence: 0.9,
      },
    ]);

    const suggestions = parseRefactorResponse(response, [unit]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      unitId: unit.id,
      filePath: unit.location.filePath,
      title: 'Agregar espacios',
      confidence: 0.9,
    });
    expect(suggestions[0]?.diff).toContain('@@');
  });

  it('devuelve un arreglo vacío si el modelo no propone cambios', () => {
    expect(parseRefactorResponse('[]', [unit])).toEqual([]);
  });

  it('lanza LlmError si confidence está fuera de [0, 1]', () => {
    const response = JSON.stringify([
      { unitName: 'add', title: 't', rationale: 'r', refactoredCode: 'function add(){}', confidence: 1.5 },
    ]);
    expect(() => parseRefactorResponse(response, [unit])).toThrow(LlmError);
  });

  it('lanza LlmError si unitName no corresponde a ninguna unidad del chunk', () => {
    const response = JSON.stringify([
      { unitName: 'otraFuncion', title: 't', rationale: 'r', refactoredCode: 'function x(){}', confidence: 0.5 },
    ]);
    expect(() => parseRefactorResponse(response, [unit])).toThrow(/no es ninguna de las unidades/);
  });

  it('lanza LlmError si la respuesta no es JSON válido', () => {
    expect(() => parseRefactorResponse('esto no es json', [unit])).toThrow(LlmError);
  });
});
