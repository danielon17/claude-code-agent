import { describe, expect, it } from 'vitest';
import { buildAnalysisUserPrompt, parseFindingsResponse } from '../../../../src/core/services/PromptTemplates.js';
import { LlmError } from '../../../../src/shared/errors.js';
import { makeCodeUnit } from '../../../helpers/fakes.js';

describe('buildAnalysisUserPrompt', () => {
  it('incluye el nombre, tipo, ubicación y código fuente de cada unidad', () => {
    const unit = makeCodeUnit({ name: 'add', kind: 'function', sourceText: 'function add() {}' });
    const prompt = buildAnalysisUserPrompt([unit]);

    expect(prompt).toContain('"add"');
    expect(prompt).toContain('function add() {}');
    expect(prompt).toContain(unit.location.filePath);
  });
});

describe('parseFindingsResponse', () => {
  const unit = makeCodeUnit({ name: 'add' });

  it('parsea un arreglo JSON plano válido', () => {
    const response = JSON.stringify([
      { unitName: 'add', severity: 'critical', category: 'security', message: 'inyección posible' },
    ]);
    const findings = parseFindingsResponse(response, [unit]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ unitId: unit.id, severity: 'critical', category: 'security' });
  });

  it('tolera que la respuesta venga envuelta en un bloque de código markdown', () => {
    const response = '```json\n[{"unitName":"add","severity":"info","category":"naming","message":"ok"}]\n```';
    const findings = parseFindingsResponse(response, [unit]);
    expect(findings).toHaveLength(1);
  });

  it('devuelve un arreglo vacío si el modelo no encontró hallazgos', () => {
    expect(parseFindingsResponse('[]', [unit])).toEqual([]);
  });

  it('lanza LlmError si la respuesta no contiene un arreglo JSON', () => {
    expect(() => parseFindingsResponse('no hay JSON acá', [unit])).toThrow(LlmError);
  });

  it('lanza LlmError si el JSON es inválido', () => {
    expect(() => parseFindingsResponse('[{"unitName": "add",}]', [unit])).toThrow(LlmError);
  });

  it('lanza LlmError si un elemento no cumple el esquema (severity inválida)', () => {
    const response = JSON.stringify([{ unitName: 'add', severity: 'catastrófico', category: 'security', message: 'x' }]);
    expect(() => parseFindingsResponse(response, [unit])).toThrow(LlmError);
  });

  it('lanza LlmError si unitName no corresponde a ninguna unidad del chunk', () => {
    const response = JSON.stringify([{ unitName: 'otraFuncion', severity: 'info', category: 'naming', message: 'x' }]);
    expect(() => parseFindingsResponse(response, [unit])).toThrow(/no es ninguna de las unidades/);
  });
});
