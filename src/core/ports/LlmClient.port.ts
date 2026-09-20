export type LlmRole = 'user' | 'assistant' | 'system';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmCompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

export type LlmStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'done'; fullText: string }
  | { type: 'error'; error: Error };

/**
 * Puerto de salida hacia un proveedor de LLM. La capa de dominio depende
 * únicamente de esta interfaz; `infrastructure/llm/AnthropicClient.ts` es
 * el adaptador concreto que la implementa contra la API de Claude.
 */
export interface LlmClient {
  /** Streaming de tokens para feedback en tiempo real en la terminal. */
  streamCompletion(
    messages: LlmMessage[],
    options?: LlmCompletionOptions,
  ): AsyncIterable<LlmStreamChunk>;

  /** Variante no interactiva que espera la respuesta completa. */
  complete(messages: LlmMessage[], options?: LlmCompletionOptions): Promise<string>;

  /** Estimación/consulta del número de tokens de un texto para el modelo activo. */
  countTokens(text: string): Promise<number>;
}
