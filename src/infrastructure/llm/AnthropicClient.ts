import type Anthropic from '@anthropic-ai/sdk';
import type {
  LlmClient,
  LlmCompletionOptions,
  LlmMessage,
  LlmStreamChunk,
} from '../../core/ports/LlmClient.port.js';
import { LlmError } from '../../shared/errors.js';

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

/**
 * Adaptador de `LlmClient` sobre `@anthropic-ai/sdk`. `streamCompletion`
 * reemite únicamente los deltas de texto del stream SSE de Anthropic como
 * eventos `text`, para que el CLI pueda pintarlos en la terminal a medida
 * que llegan, y cierra con `done` usando el texto completo ya ensamblado
 * por el SDK.
 */
export class AnthropicClient implements LlmClient {
  constructor(
    private readonly client: AnthropicMessagesClient,
    private readonly defaultModel: string,
  ) {}

  async *streamCompletion(
    messages: LlmMessage[],
    options: LlmCompletionOptions = {},
  ): AsyncIterable<LlmStreamChunk> {
    let stream: AnthropicStreamHandle;
    try {
      stream = this.client.messages.stream({
        model: options.model ?? this.defaultModel,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options.temperature,
        system: options.system,
        messages: toAnthropicMessages(messages),
      });
    } catch (error) {
      throw toLlmError(error, 'No se pudo iniciar el streaming con Claude');
    }

    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
      }
      yield { type: 'done', fullText: await stream.finalText() };
    } catch (error) {
      const llmError = toLlmError(error, 'Falló el streaming de la respuesta de Claude');
      yield { type: 'error', error: llmError };
      throw llmError;
    }
  }

  async complete(messages: LlmMessage[], options: LlmCompletionOptions = {}): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: options.model ?? this.defaultModel,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options.temperature,
        system: options.system,
        messages: toAnthropicMessages(messages),
      });
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
      const result = await this.client.beta.messages.countTokens({
        model: this.defaultModel,
        messages: [{ role: 'user', content: text }],
      });
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
