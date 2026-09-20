import { describe, expect, it } from 'vitest';
import { AppError, ConfigurationError, isAppError, LlmError, ParsingError } from '../../../src/shared/errors.js';

describe('errors', () => {
  it('asigna el código y el nombre correctos por subtipo', () => {
    const parsingError = new ParsingError('archivo inválido');
    expect(parsingError.code).toBe('PARSING_ERROR');
    expect(parsingError.name).toBe('ParsingError');
    expect(parsingError.message).toBe('archivo inválido');
  });

  it('preserva la causa original del error', () => {
    const cause = new Error('fallo de red');
    const llmError = new LlmError('la API de Claude no respondió', cause);
    expect(llmError.cause).toBe(cause);
  });

  it('isAppError distingue errores de la aplicación de errores nativos', () => {
    expect(isAppError(new ConfigurationError('falta ANTHROPIC_API_KEY'))).toBe(true);
    expect(isAppError(new Error('genérico'))).toBe(false);
  });

  it('todas las subclases son instancias de AppError', () => {
    expect(new ParsingError('x')).toBeInstanceOf(AppError);
    expect(new LlmError('x')).toBeInstanceOf(AppError);
    expect(new ConfigurationError('x')).toBeInstanceOf(AppError);
  });
});
