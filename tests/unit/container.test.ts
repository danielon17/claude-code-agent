import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe('createContainer', () => {
  it('cablea el logger, la config y el parser real (TsCompilerParser)', async () => {
    const { createContainer } = await import('../../src/container.js');
    const { TsCompilerParser } = await import('../../src/infrastructure/parsing/TsCompilerParser.js');
    const container = createContainer();
    expect(container.logger).toBeDefined();
    expect(container.config).toBeDefined();
    expect(container.parser).toBeInstanceOf(TsCompilerParser);
  });

  it('createLlmClient() lanza ConfigurationError si falta ANTHROPIC_API_KEY', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.resetModules();
    const { createContainer } = await import('../../src/container.js');
    const { ConfigurationError } = await import('../../src/shared/errors.js');

    const container = createContainer();
    expect(() => container.createLlmClient()).toThrow(ConfigurationError);
  });

  it('createLlmClient() devuelve un AnthropicClient si ANTHROPIC_API_KEY está configurada', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    vi.resetModules();
    const { createContainer } = await import('../../src/container.js');
    const { AnthropicClient } = await import('../../src/infrastructure/llm/AnthropicClient.js');

    const container = createContainer();
    expect(container.createLlmClient()).toBeInstanceOf(AnthropicClient);
  });
});
