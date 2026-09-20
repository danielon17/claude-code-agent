/**
 * Jerarquía de errores de la aplicación. Cada capa lanza el subtipo que le
 * corresponde para que el CLI pueda mapear errores a códigos de salida y
 * mensajes accionables sin usar `instanceof Error` genérico.
 */
export abstract class AppError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ParsingError extends AppError {
  readonly code = 'PARSING_ERROR';
}

export class LlmError extends AppError {
  readonly code = 'LLM_ERROR';
}

export class ConfigurationError extends AppError {
  readonly code = 'CONFIGURATION_ERROR';
}

export class FileSystemError extends AppError {
  readonly code = 'FILESYSTEM_ERROR';
}

export class DiffApplyError extends AppError {
  readonly code = 'DIFF_APPLY_ERROR';
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
