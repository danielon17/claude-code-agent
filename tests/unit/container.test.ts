import { describe, expect, it } from 'vitest';
import { createContainer } from '../../src/container.js';
import { TsCompilerParser } from '../../src/infrastructure/parsing/TsCompilerParser.js';

describe('createContainer', () => {
  it('cablea el logger, la config y el parser real (TsCompilerParser)', () => {
    const container = createContainer();
    expect(container.logger).toBeDefined();
    expect(container.config).toBeDefined();
    expect(container.parser).toBeInstanceOf(TsCompilerParser);
  });
});
