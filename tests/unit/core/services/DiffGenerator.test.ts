import { describe, expect, it } from 'vitest';
import { applyRefactorToFileText, generateUnifiedDiff } from '../../../../src/core/services/DiffGenerator.js';
import { makeCodeUnit } from '../../../helpers/fakes.js';

describe('generateUnifiedDiff', () => {
  it('genera un unified diff con las líneas agregadas y removidas', () => {
    const unit = makeCodeUnit({ name: 'add', sourceText: 'function add(a, b) {\n  return a + b;\n}' });
    const diff = generateUnifiedDiff(unit, 'function add(a, b) {\n  return a + b + 0;\n}');

    expect(diff).toContain('--- fixture.ts');
    expect(diff).toContain('+++ fixture.ts');
    expect(diff).toContain('-  return a + b;');
    expect(diff).toContain('+  return a + b + 0;');
  });

  it('no produce hunks de cambio si el código no cambió', () => {
    const unit = makeCodeUnit({ name: 'add', sourceText: 'function add() {}' });
    const diff = generateUnifiedDiff(unit, 'function add() {}');
    expect(diff).not.toContain('@@');
  });
});

describe('applyRefactorToFileText', () => {
  it('reemplaza únicamente el rango de líneas de la unidad, preservando el resto del archivo', () => {
    const originalFile = ['import x from "x";', '', 'function add(a, b) {', '  return a + b;', '}', '', 'const y = 1;'].join(
      '\n',
    );
    const unit = makeCodeUnit({
      name: 'add',
      location: { filePath: 'file.ts', startLine: 3, endLine: 5, startColumn: 1, endColumn: 2 },
    });

    const result = applyRefactorToFileText(originalFile, unit, 'function add(a, b) {\n  return a + b + 0;\n}');

    expect(result).toBe(
      ['import x from "x";', '', 'function add(a, b) {', '  return a + b + 0;', '}', '', 'const y = 1;'].join('\n'),
    );
  });

  it('distingue dos unidades con el mismo código fuente por su ubicación (no por búsqueda de texto)', () => {
    const originalFile = ['class A {', '  add() { return 1; }', '}', '', 'class B {', '  add() { return 1; }', '}'].join(
      '\n',
    );
    const secondAdd = makeCodeUnit({
      name: 'B.add',
      location: { filePath: 'file.ts', startLine: 6, endLine: 6, startColumn: 1, endColumn: 2 },
    });

    const result = applyRefactorToFileText(originalFile, secondAdd, '  add() { return 2; }');

    expect(result).toBe(
      ['class A {', '  add() { return 1; }', '}', '', 'class B {', '  add() { return 2; }', '}'].join('\n'),
    );
  });
});
