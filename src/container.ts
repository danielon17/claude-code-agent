import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { config, type AppConfig } from './shared/config.js';
import { logger as baseLogger, type Logger } from './shared/logger.js';
import { ConfigurationError } from './shared/errors.js';
import { RateLimiter } from './shared/rateLimiter.js';
import { TsCompilerParser } from './infrastructure/parsing/TsCompilerParser.js';
import { AnthropicClient } from './infrastructure/llm/AnthropicClient.js';
import { NodeFileSystem } from './infrastructure/filesystem/NodeFileSystem.js';
import type { CodeParser } from './core/ports/CodeParser.port.js';
import type { LlmClient } from './core/ports/LlmClient.port.js';
import type { FileSystemPort } from './core/ports/FileSystem.port.js';

/**
 * Composition root: único lugar donde se construyen e inyectan las
 * implementaciones concretas de los puertos hexagonales. Los comandos del
 * CLI obtienen sus dependencias de aquí en vez de instanciarlas ellos
 * mismos, para mantener la capa de interfaz desacoplada de infraestructura.
 *
 * Cada invocación de `createContainer()` genera un `runId` corto y lo
 * adjunta a todas las líneas de log de esa ejecución (`logger.child`), para
 * poder correlacionar el output de una corrida del CLI en un log agregado
 * (útil si se usa en CI o se redirige `--log-level` a un colector).
 *
 * `createLlmClient` es perezoso (no un valor ya construido) a propósito:
 * validar `ANTHROPIC_API_KEY` recién cuando un comando realmente necesita
 * el LLM evita que `generate-tests` (todavía sin esa dependencia cableada)
 * falle por una key ausente que no usa.
 */
export interface AppContainer {
  config: AppConfig;
  logger: Logger;
  parser: CodeParser;
  fileSystem: FileSystemPort;
  createLlmClient: () => LlmClient;
}

export function createContainer(): AppContainer {
  const runId = randomUUID().slice(0, 8);
  const logger = baseLogger.child({ runId });

  return {
    config,
    logger,
    parser: new TsCompilerParser(),
    fileSystem: new NodeFileSystem(),
    createLlmClient: () => {
      if (!config.anthropicApiKey) {
        throw new ConfigurationError(
          'ANTHROPIC_API_KEY no está configurada. Definila en .env (ver .env.example) o como variable de entorno para usar el análisis semántico con Claude.',
        );
      }
      const sdkClient = new Anthropic({ apiKey: config.anthropicApiKey });
      return new AnthropicClient(sdkClient, config.claudeModel, {
        retry: {
          maxAttempts: config.anthropic.maxRetries,
          initialDelayMs: config.anthropic.retryInitialDelayMs,
          maxDelayMs: config.anthropic.retryMaxDelayMs,
          onRetry: (attempt, delayMs, error) =>
            logger.warn(
              { attempt, delayMs, err: error },
              `Reintentando llamada a Claude (intento ${attempt}) tras un error transitorio`,
            ),
        },
        rateLimiter: new RateLimiter({ minIntervalMs: config.anthropic.minRequestIntervalMs }),
      });
    },
  };
}
