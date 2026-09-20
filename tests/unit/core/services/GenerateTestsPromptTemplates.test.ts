import { describe, expect, it } from 'vitest';
import {
  buildGenerateTestsSystemPrompt,
  buildGenerateTestsUserPrompt,
  parseGenerateTestsResponse,
} from '../../../../src/core/services/GenerateTestsPromptTemplates.js';
import { LlmError } from '../../../../src/shared/errors.js';
import { makeCodeUnit } from '../../../helpers/fakes.js';

describe('buildGenerateTestsSystemPrompt', () => {
  it('incluye el import correcto de vitest', () => {
    expect(buildGenerateTestsSystemPrompt('vitest')).toContain("from 'vitest'");
  });

  it('incluye el import correcto de jest', () => {
    expect(buildGenerateTestsSystemPrompt('jest')).toContain("from '@jest/globals'");
  });
});

describe('buildGenerateTestsUserPrompt', () => {
  it('incluye el código fuente y la ruta de import indicada', () => {
    const unit = makeCodeUnit({ name: 'add', sourceText: 'function add() {}' });
    const prompt = buildGenerateTestsUserPrompt([unit], './math.js');
    expect(prompt).toContain('function add() {}');
    expect(prompt).toContain('./math.js');
  });
});

describe('parseGenerateTestsResponse', () => {
  it('devuelve el código fuente del test parseado', () => {
    const response = JSON.stringify({ testFileSourceCode: "import { add } from './x.js';" });
    expect(parseGenerateTestsResponse(response)).toBe("import { add } from './x.js';");
  });

  it('tolera bloques de markdown', () => {
    const response = '```json\n{"testFileSourceCode": "code"}\n```';
    expect(parseGenerateTestsResponse(response)).toBe('code');
  });

  it('lanza LlmError si no hay un objeto JSON', () => {
    expect(() => parseGenerateTestsResponse('sin json')).toThrow(LlmError);
  });

  it('lanza LlmError si falta testFileSourceCode', () => {
    expect(() => parseGenerateTestsResponse('{}')).toThrow(LlmError);
  });
});
