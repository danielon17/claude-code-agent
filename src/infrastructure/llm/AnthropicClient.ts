import type Anthropic from '@anthropic-ai/sdk';
import type {
  LlmClient,
  LlmCompletionOptions,
  LlmMessage,
  LlmStreamChunk,
} from '../../core/ports/LlmClient.port.js';
import { LlmError } from '../../shared/errors.js';
import { calculateBackoffDelayMs, sleep, withRetry, type RetryOptions } from '../../shared/retry.js';
import { RateLimiter } from '../../shared/rateLimiter.js';

const DEFAULT_MAX_TOKENS = 4096;

/**
 * Lo mínimo que este adaptador necesita del SDK de Anthropic. Tipar contra
 * esta interfaz estructural (en vez de la clase concreta `Anthropic`)
 * permite inyectar un doble de prueba en los tests sin acoplarse a la
 * implementación exacta del stream del SDK.
 */
export interface AnthropicStreamHandle {
  [Symbol.asyncIterator](): AsyncIterator<Anthropic.MessageStreamEvent>;
  finalText(): Promise<string>;
}

export interface AnthropicMessagesClient {
  messages: {
    stream(params: Anthropic.MessageStreamParams): AnthropicStreamHandle;
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
  beta: {
    messages: {
      countTokens(params: Anthropic.Beta.MessageCountTokensParams): Promise<Anthropic.Beta.BetaMessageTokensCount>;
    };
  };
}

export interface AnthropicClientOptions {
  /** Reintentos ante errores transitorios (timeouts, 429, 5xx). Por defecto: 3 intentos, backoff 500ms-8s. */
  retry?: RetryOptions;
  /** Espacia las llamadas salientes para no exceder el límite de requests/minuto de la cuenta. */
  rateLimiter?: RateLimiter;
}

const DEFAULT_RETRY_OPTIONS: Required<Pick<RetryOptions, 'maxAttempts' | 'initialDelayMs' | 'maxDelayMs'>> & RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 8000,
  isRetryable: isRetryableAnthropicError,
};

/**
 * Adaptador de `LlmClient` sobre `@anthropic-ai/sdk`. `streamCompletion`
 * reemite únicamente los deltas de texto del stream SSE de Anthropic como
 * eventos `text`, para que el CLI pueda pintarlos en la terminal a medida
 * que llegan, y cierra con `done` usando el texto completo ya ensamblado
 * por el SDK.
 *
 * Resiliencia: cada llamada pasa primero por un `RateLimiter` (espacia
 * requests para no pegarle al límite de RPM de la cuenta) y, ante un error
 * transitorio (timeout, 429, 5xx), se reintenta con backoff exponencial.
 * En streaming, solo se reintenta si todavía NO se emitió ningún token al
 * consumidor: una vez que el usuario empezó a ver texto en la terminal,
 * reintentar desde cero produciría una respuesta duplicada/corrupta, así
 * que en ese caso el error se propaga tal cual (falla explícita, no
 * degradación silenciosa).
 */
export class AnthropicClient implements LlmClient {
  private readonly retryOptions: RetryOptions;
  private readonly rateLimiter: RateLimiter;

  constructor(
    private readonly client: AnthropicMessagesClient,
    private readonly defaultModel: string,
    options: AnthropicClientOptions = {},
  ) {
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options.retry };
    this.rateLimiter = options.rateLimiter ?? new RateLimiter({ minIntervalMs: 0 });
  }

  async *streamCompletion(
    messages: LlmMessage[],
    options: LlmCompletionOptions = {},
  ): AsyncIterable<LlmStreamChunk> {
    const params: Anthropic.MessageStreamParams = {
      model: options.model ?? this.defaultModel,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options.temperature,
      system: options.system,
      messages: toAnthropicMessages(messages),
    };
    const maxAttempts = this.retryOptions.maxAttempts ?? 3;
    const isRetryable = this.retryOptions.isRetryable ?? (() => true);

    let attempt = 0;
    let emittedAnyText = false;

    for (;;) {
      attempt += 1;
      try {
        const stream = await this.rateLimiter.schedule(() => Promise.resolve(this.client.messages.stream(params)));
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            emittedAnyText = true;
            yield { type: 'text', text: event.delta.text };
          }
        }
        yield { type: 'done', fullText: await stream.finalText() };
        return;
      } catch (error) {
        if (!emittedAnyText && attempt < maxAttempts && isRetryable(error)) {
          const delayMs = calculateBackoffDelayMs(attempt, this.retryOptions);
          this.retryOptions.onRetry?.(attempt, delayMs, error);
          await sleep(delayMs);
          continue;
        }
        const llmError = toLlmError(error, 'Falló el streaming de la respuesta de Claude');
        yield { type: 'error', error: llmError };
        throw llmError;
      }
    }
  }

  async complete(messages: LlmMessage[], options: LlmCompletionOptions = {}): Promise<string> {
    try {
      const response = await withRetry(
        () =>
          this.rateLimiter.schedule(() =>
            this.client.messages.create({
              model: options.model ?? this.defaultModel,
              max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
              temperature: options.temperature,
              system: options.system,
              messages: toAnthropicMessages(messages),
            }),
          ),
        this.retryOptions,
      );
      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
    } catch (error) {
      throw toLlmError(error, 'Falló la llamada a la API de Claude');
    }
  }

  async countTokens(text: string): Promise<number> {
    try {
      const result = await withRetry(
        () =>
          this.rateLimiter.schedule(() =>
            this.client.beta.messages.countTokens({
              model: this.defaultModel,
              messages: [{ role: 'user', content: text }],
            }),
          ),
        this.retryOptions,
      );
      return result.input_tokens;
    } catch (error) {
      throw toLlmError(error, 'Falló el conteo de tokens de Claude');
    }
  }
}

function toAnthropicMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
  return messages.map((message) => {
    if (message.role === 'system') {
      throw new LlmError(
        'Los mensajes de rol "system" deben pasarse vía LlmCompletionOptions.system, no dentro del array de mensajes.',
      );
    }
    return { role: message.role, content: message.content };
  });
}

function toLlmError(error: unknown, contextMessage: string): LlmError {
  return error instanceof Error
    ? new LlmError(`${contextMessage}: ${error.message}`, error)
    : new LlmError(contextMessage, error);
}

/** Reintentable: timeouts/errores de conexión (sin status numérico) o respuestas 429/5xx. Los 4xx de validación/auth no se reintentan. */
function isRetryableAnthropicError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') {
    return true;
  }
  return status === 429 || status >= 500;
}
