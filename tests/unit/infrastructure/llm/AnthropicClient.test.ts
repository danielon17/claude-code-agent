import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicClient,
  type AnthropicClientOptions,
  type AnthropicMessagesClient,
  type AnthropicStreamHandle,
} from '../../../../src/infrastructure/llm/AnthropicClient.js';
import { LlmError } from '../../../../src/shared/errors.js';
import type { RateLimiter } from '../../../../src/shared/rateLimiter.js';

/** Doble de RateLimiter que ejecuta `fn` inmediatamente, sin espaciar llamadas (la lógica de espaciado real se testea en rateLimiter.test.ts). */
function createPassthroughRateLimiter(): RateLimiter {
  return { schedule: <T>(fn: () => Promise<T>) => fn() } as unknown as RateLimiter;
}

/** Por defecto, un solo intento (sin reintentos) y sin delay de rate limit, para que los tests que no ejercitan resiliencia corran instantáneos. */
function defaultTestOptions(overrides: AnthropicClientOptions = {}): AnthropicClientOptions {
  return {
    retry: { maxAttempts: 1, ...overrides.retry },
    rateLimiter: createPassthroughRateLimiter(),
    ...overrides,
  };
}

function createFakeStreamHandle(
  events: Array<{ type: 'content_block_delta'; index: number; delta: { type: 'text_delta'; text: string } }>,
  options: { finalText?: string; failAfterEvents?: Error } = {},
): AnthropicStreamHandle {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: async () => {
          if (i < events.length) {
            const value = events[i] as unknown as Anthropic.MessageStreamEvent;
            i += 1;
            return { value, done: false };
          }
          if (options.failAfterEvents) {
            throw options.failAfterEvents;
          }
          return { value: undefined, done: true };
        },
      };
    },
    finalText: () => Promise.resolve(options.finalText ?? events.map((e) => e.delta.text).join('')),
  };
}

function delta(text: string, index = 0): { type: 'content_block_delta'; index: number; delta: { type: 'text_delta'; text: string } } {
  return { type: 'content_block_delta', index, delta: { type: 'text_delta', text } };
}

async function collectStream(client: AnthropicClient, message = 'hola') {
  const events = [];
  for await (const event of client.streamCompletion([{ role: 'user', content: message }])) {
    events.push(event);
  }
  return events;
}

describe('AnthropicClient', () => {
  describe('streamCompletion', () => {
    it('reemite cada delta de texto como evento "text" y cierra con "done" con el texto completo', async () => {
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => createFakeStreamHandle([delta('Hola '), delta('mundo')], { finalText: 'Hola mundo' }),
          create: () => Promise.reject(new Error('no usado en este test')),
        },
        beta: { messages: { countTokens: () => Promise.reject(new Error('no usado en este test')) } },
      };
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5', defaultTestOptions());

      expect(await collectStream(client)).toEqual([
        { type: 'text', text: 'Hola ' },
        { type: 'text', text: 'mundo' },
        { type: 'done', fullText: 'Hola mundo' },
      ]);
    });

    it('ignora eventos que no son deltas de texto (p.ej. input_json de tool use)', async () => {
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => createFakeStreamHandle([delta('ok')]),
          create: () => Promise.reject(new Error('no usado')),
        },
        beta: { messages: { countTokens: () => Promise.reject(new Error('no usado')) } },
      };
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5', defaultTestOptions());
      expect((await collectStream(client)).map((e) => e.type)).toEqual(['text', 'done']);
    });

    it('lanza LlmError (sin reintentar) si el stream falla después de haber emitido texto', async () => {
      let callCount = 0;
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => {
            callCount += 1;
            return createFakeStreamHandle([delta('parcial')], { failAfterEvents: new Error('conexión perdida') });
          },
          create: () => Promise.reject(new Error('no usado')),
        },
        beta: { messages: { countTokens: () => Promise.reject(new Error('no usado')) } },
      };
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5', defaultTestOptions({ retry: { maxAttempts: 5 } }));

      await expect(collectStream(client)).rejects.toBeInstanceOf(LlmError);
      expect(callCount).toBe(1);
    });

    it('reintenta si la conexión falla ANTES de emitir texto, y tiene éxito en el segundo intento', async () => {
      let callCount = 0;
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => {
            callCount += 1;
            if (callCount === 1) {
              return createFakeStreamHandle([], { failAfterEvents: Object.assign(new Error('timeout'), { status: undefined }) });
            }
            return createFakeStreamHandle([delta('ok')], { finalText: 'ok' });
          },
          create: () => Promise.reject(new Error('no usado')),
        },
        beta: { messages: { countTokens: () => Promise.reject(new Error('no usado')) } },
      };
      const client = new AnthropicClient(
        fakeClient,
        'claude-sonnet-5',
        defaultTestOptions({ retry: { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 2 } }),
      );

      const events = await collectStream(client);

      expect(callCount).toBe(2);
      expect(events).toEqual([{ type: 'text', text: 'ok' }, { type: 'done', fullText: 'ok' }]);
    });

    it('no reintenta un error no-transitorio (4xx de validación/auth)', async () => {
      let callCount = 0;
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => {
            callCount += 1;
            return createFakeStreamHandle([], { failAfterEvents: Object.assign(new Error('bad request'), { status: 400 }) });
          },
          create: () => Promise.reject(new Error('no usado')),
        },
        beta: { messages: { countTokens: () => Promise.reject(new Error('no usado')) } },
      };
      const client = new AnthropicClient(
        fakeClient,
        'claude-sonnet-5',
        defaultTestOptions({ retry: { maxAttempts: 5, initialDelayMs: 1 } }),
      );

      await expect(collectStream(client)).rejects.toBeInstanceOf(LlmError);
      expect(callCount).toBe(1);
    });

    it('lanza LlmError si un mensaje trae rol "system" (debe ir en options.system)', async () => {
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => createFakeStreamHandle([]),
          create: () => Promise.reject(new Error('no usado')),
        },
        beta: { messages: { countTokens: () => Promise.reject(new Error('no usado')) } },
      };
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5', defaultTestOptions());

      await expect(async () => {
        for await (const _event of client.streamCompletion([{ role: 'system', content: 'x' }])) {
          // no debería llegar a yieldear nada
        }
      }).rejects.toBeInstanceOf(LlmError);
    });
  });

  describe('complete', () => {
    it('concatena los bloques de texto de la respuesta', async () => {
      const fakeMessage = { content: [{ type: 'text', text: 'Hola ' }, { type: 'text', text: 'mundo' }] } as unknown as Anthropic.Message;
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => createFakeStreamHandle([]),
          create: () => Promise.resolve(fakeMessage),
        },
        beta: { messages: { countTokens: () => Promise.reject(new Error('no usado')) } },
      };
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5', defaultTestOptions());
      const text = await client.complete([{ role: 'user', content: 'hola' }]);
      expect(text).toBe('Hola mundo');
    });

    it('lanza LlmError sin reintentar ante un error no-transitorio (401)', async () => {
      let callCount = 0;
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => createFakeStreamHandle([]),
          create: () => {
            callCount += 1;
            return Promise.reject(Object.assign(new Error('unauthorized'), { status: 401 }));
          },
        },
        beta: { messages: { countTokens: () => Promise.reject(new Error('no usado')) } },
      };
      const client = new AnthropicClient(
        fakeClient,
        'claude-sonnet-5',
        defaultTestOptions({ retry: { maxAttempts: 5, initialDelayMs: 1 } }),
      );
      await expect(client.complete([{ role: 'user', content: 'hola' }])).rejects.toBeInstanceOf(LlmError);
      expect(callCount).toBe(1);
    });

    it('reintenta ante un 429 y tiene éxito antes de agotar los intentos', async () => {
      let callCount = 0;
      const fakeMessage = { content: [{ type: 'text', text: 'ok' }] } as unknown as Anthropic.Message;
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => createFakeStreamHandle([]),
          create: () => {
            callCount += 1;
            if (callCount < 3) {
              return Promise.reject(Object.assign(new Error('rate limited'), { status: 429 }));
            }
            return Promise.resolve(fakeMessage);
          },
        },
        beta: { messages: { countTokens: () => Promise.reject(new Error('no usado')) } },
      };
      const client = new AnthropicClient(
        fakeClient,
        'claude-sonnet-5',
        defaultTestOptions({ retry: { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 2 } }),
      );

      await expect(client.complete([{ role: 'user', content: 'hola' }])).resolves.toBe('ok');
      expect(callCount).toBe(3);
    });
  });

  describe('countTokens', () => {
    it('devuelve input_tokens de la respuesta de la API', async () => {
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => createFakeStreamHandle([]),
          create: () => Promise.reject(new Error('no usado')),
        },
        beta: { messages: { countTokens: () => Promise.resolve({ input_tokens: 42 }) } },
      };
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5', defaultTestOptions());
      await expect(client.countTokens('hola mundo')).resolves.toBe(42);
    });
  });

  describe('rate limiting', () => {
    it('pasa cada llamada (stream, complete, countTokens) por el RateLimiter inyectado', async () => {
      const scheduleSpy = vi.fn(<T,>(fn: () => Promise<T>) => fn());
      const rateLimiter = { schedule: scheduleSpy } as unknown as RateLimiter;
      const fakeMessage = { content: [{ type: 'text', text: 'ok' }] } as unknown as Anthropic.Message;
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => createFakeStreamHandle([delta('ok')]),
          create: () => Promise.resolve(fakeMessage),
        },
        beta: { messages: { countTokens: () => Promise.resolve({ input_tokens: 1 }) } },
      };
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5', { retry: { maxAttempts: 1 }, rateLimiter });

      await collectStream(client);
      await client.complete([{ role: 'user', content: 'x' }]);
      await client.countTokens('x');

      expect(scheduleSpy).toHaveBeenCalledTimes(3);
    });
  });
});
