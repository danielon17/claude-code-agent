import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicClient,
  type AnthropicMessagesClient,
  type AnthropicStreamHandle,
} from '../../../../src/infrastructure/llm/AnthropicClient.js';
import { LlmError } from '../../../../src/shared/errors.js';

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
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5');

      const events = [];
      for await (const event of client.streamCompletion([{ role: 'user', content: 'hola' }])) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: 'text', text: 'Hola ' },
        { type: 'text', text: 'mundo' },
        { type: 'done', fullText: 'Hola mundo' },
      ]);
    });

    it('ignora eventos que no son deltas de texto (p.ej. input_json de tool use)', async () => {
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () =>
            createFakeStreamHandle([
              { type: 'content_block_delta', index: 0, delta: { type: 'text_delta' as const, text: 'ok' } },
            ]),
          create: () => Promise.reject(new Error('no usado')),
        },
        beta: { messages: { countTokens: () => Promise.reject(new Error('no usado')) } },
      };
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5');
      const events = [];
      for await (const event of client.streamCompletion([{ role: 'user', content: 'x' }])) {
        events.push(event.type);
      }
      expect(events).toEqual(['text', 'done']);
    });

    it('lanza LlmError si el stream falla a mitad de camino', async () => {
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => createFakeStreamHandle([delta('parcial')], { failAfterEvents: new Error('conexión perdida') }),
          create: () => Promise.reject(new Error('no usado')),
        },
        beta: { messages: { countTokens: () => Promise.reject(new Error('no usado')) } },
      };
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5');

      await expect(async () => {
        for await (const _event of client.streamCompletion([{ role: 'user', content: 'x' }])) {
          // consumir hasta que rechace
        }
      }).rejects.toBeInstanceOf(LlmError);
    });

    it('lanza LlmError si un mensaje trae rol "system" (debe ir en options.system)', async () => {
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => createFakeStreamHandle([]),
          create: () => Promise.reject(new Error('no usado')),
        },
        beta: { messages: { countTokens: () => Promise.reject(new Error('no usado')) } },
      };
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5');

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
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5');
      const text = await client.complete([{ role: 'user', content: 'hola' }]);
      expect(text).toBe('Hola mundo');
    });

    it('lanza LlmError si la API rechaza', async () => {
      const fakeClient: AnthropicMessagesClient = {
        messages: {
          stream: () => createFakeStreamHandle([]),
          create: () => Promise.reject(new Error('rate limited')),
        },
        beta: { messages: { countTokens: () => Promise.reject(new Error('no usado')) } },
      };
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5');
      await expect(client.complete([{ role: 'user', content: 'hola' }])).rejects.toBeInstanceOf(LlmError);
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
      const client = new AnthropicClient(fakeClient, 'claude-sonnet-5');
      await expect(client.countTokens('hola mundo')).resolves.toBe(42);
    });
  });
});
