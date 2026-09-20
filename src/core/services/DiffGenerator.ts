import { createTwoFilesPatch } from 'diff';
import type { CodeUnit } from '../entities/CodeUnit.js';

/** Unified diff entre el código original de una unidad y su versión refactorizada. */
export function generateUnifiedDiff(unit: CodeUnit, refactoredSourceText: string): string {
  return createTwoFilesPatch(
    unit.location.filePath,
    unit.location.filePath,
    unit.sourceText,
    refactoredSourceText,
    'original',
    'refactorizado',
  );
}

/**
 * Reemplaza las líneas [startLine, endLine] (1-indexadas, inclusive) de
 * `originalFileText` por `refactoredSourceText`, dejando el resto del
 * archivo intacto. Usa la ubicación exacta que ya calculó el parser en
 * vez de buscar el texto original dentro del archivo: evita falsos
 * positivos cuando el mismo snippet aparece más de una vez (p.ej. dos
 * métodos `add` en clases distintas).
 */
export function applyRefactorToFileText(originalFileText: string, unit: CodeUnit, refactoredSourceText: string): string {
  const lines = originalFileText.split('\n');
  const before = lines.slice(0, unit.location.startLine - 1);
  const after = lines.slice(unit.location.endLine);
  return [...before, refactoredSourceText, ...after].join('\n');
}
