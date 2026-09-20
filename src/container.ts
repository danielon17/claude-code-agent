import Anthropic from '@anthropic-ai/sdk';
import { config, type AppConfig } from './shared/config.js';
import { logger, type Logger } from './shared/logger.js';
import { ConfigurationError } from './shared/errors.js';
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
 * `createLlmClient` es perezoso (no un valor ya construido) a propósito:
 * validar `ANTHROPIC_API_KEY` recién cuando un comando realmente necesita
 * el LLM evita que `generate-tests` (todavía sin esa dependencia cableada)
 * falle por una key ausente que no usa.
 *
 * TODO: a medida que se implemente el resto de adaptadores
 * (TerminalFormatter/JsonFormatter/MarkdownFormatter), se registran aquí
 * junto con los use cases ya cableados con sus dependencias reales.
 */
export interface AppContainer {
  config: AppConfig;
  logger: Logger;
  parser: CodeParser;
  fileSystem: FileSystemPort;
  createLlmClient: () => LlmClient;
}

export function createContainer(): AppContainer {
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
      return new AnthropicClient(sdkClient, config.claudeModel);
    },
  };
}
