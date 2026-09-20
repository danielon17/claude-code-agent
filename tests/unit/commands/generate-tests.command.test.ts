import { afterEach, describe, expect, it } from 'vitest';
import { runGenerateTestsCommand } from '../../../src/commands/generate-tests.command.js';
import { createFakeLogger } from '../../helpers/fakeLogger.js';

afterEach(() => {
  process.exitCode = undefined;
});

describe('runGenerateTestsCommand', () => {
  it('loguea que GenerateTestsUseCase aún no está implementado, sin lanzar', async () => {
    const { logger, calls } = createFakeLogger();
    await runGenerateTestsCommand('.', { framework: 'vitest' }, { logger });
    expect(calls.some((call) => call.level === 'warn' && String(call.args[0]).includes('no está implementado'))).toBe(
      true,
    );
    expect(process.exitCode).toBeUndefined();
  });
});
