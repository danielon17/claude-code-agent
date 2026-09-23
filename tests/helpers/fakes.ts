import type { CodeParser } from '../../src/core/ports/CodeParser.port.js';
import type { LlmClient, LlmCompletionOptions, LlmMessage } from '../../src/core/ports/LlmClient.port.js';
import type { FileSystemPort } from '../../src/core/ports/FileSystem.port.js';
import type { CodeUnit, CodeUnitKind } from '../../src/core/entities/CodeUnit.js';
import { FileSystemError } from '../../src/shared/errors.js';
import { createTelemetry, type Telemetry } from '../../src/shared/telemetry.js';

export const TEST_RUN_ID = 'test-run';

/** Telemetry real sin exporter configurado: crea spans de verdad (verificables con un InMemorySpanExporter propio si hace falta) pero no los envía a ningún colector externo. */
export function createFakeTelemetry(): Telemetry {
  return createTelemetry();
}

export function makeCodeUnit(overrides: Partial<CodeUnit> & { name: string }): CodeUnit {
  return {
    id: `fixture.ts#${overrides.name}`,
    kind: 'function' as CodeUnitKind,
    sourceText: `function ${overrides.name}() {}`,
    location: { filePath: 'fixture.ts', startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 },
    estimatedTokens: 10,
    dependencies: [],
    ...overrides,
  };
}

/** Doble de `CodeParser` que siempre devuelve las mismas unidades, sin tocar el filesystem. */
export function createFakeParser(units: CodeUnit[]): CodeParser {
  return {
    parseFile: () => Promise.resolve(units),
    parseDirectory: () => Promise.resolve(units),
    parse: () => Promise.resolve(units),
  };
}

export interface FakeLlmCall {
  messages: LlmMessage[];
  options?: LlmCompletionOptions;
}

/**
 * Doble de `LlmClient` cuyo `streamCompletion` devuelve, en orden, una
 * respuesta scripteada por llamada (simulando un único evento de texto
 * seguido de `done`, suficiente para ejercitar a los consumidores del
 * puerto sin pegarle a la API real).
 */
export function createFakeLlmClient(responses: string[]): { llm: LlmClient; calls: FakeLlmCall[] } {
  const calls: FakeLlmCall[] = [];
  let callIndex = 0;

  const llm: LlmClient = {
    async *streamCompletion(messages, options) {
      calls.push({ messages, options });
      const response = responses[callIndex] ?? '[]';
      callIndex += 1;
      yield { type: 'text', text: response };
      yield { type: 'done', fullText: response };
    },
    complete: () => Promise.reject(new Error('complete() no usado en estos tests')),
    countTokens: () => Promise.reject(new Error('countTokens() no usado en estos tests')),
  };

  return { llm, calls };
}

/** Doble de `FileSystemPort` en memoria, para testear use cases que leen/escriben archivos sin tocar el disco real. */
export function createFakeFileSystem(initialFiles: Record<string, string> = {}): FileSystemPort {
  const files = new Map(Object.entries(initialFiles));

  return {
    readFile: (filePath: string) => {
      const contents = files.get(filePath);
      if (contents === undefined) {
        return Promise.reject(new FileSystemError(`No se pudo leer el archivo: ${filePath}`));
      }
      return Promise.resolve(contents);
    },
    writeFile: (filePath: string, contents: string) => {
      files.set(filePath, contents);
      return Promise.resolve();
    },
    exists: (filePath: string) => Promise.resolve(files.has(filePath)),
    isDirectory: () => Promise.resolve(false),
  };
}
