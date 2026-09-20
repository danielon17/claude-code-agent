import { config, type AppConfig } from './shared/config.js';
import { logger, type Logger } from './shared/logger.js';
import { TsCompilerParser } from './infrastructure/parsing/TsCompilerParser.js';
import type { CodeParser } from './core/ports/CodeParser.port.js';

/**
 * Composition root: único lugar donde se construyen e inyectan las
 * implementaciones concretas de los puertos hexagonales. Los comandos del
 * CLI obtienen sus dependencias de aquí en vez de instanciarlas ellos
 * mismos, para mantener la capa de interfaz desacoplada de infraestructura.
 *
 * TODO: a medida que se implementen el resto de adaptadores (AnthropicClient,
 * DiffGenerator, TerminalFormatter, NodeFileSystem), se registran aquí junto
 * con los use cases ya cableados con sus dependencias reales.
 */
export interface AppContainer {
  config: AppConfig;
  logger: Logger;
  parser: CodeParser;
}

export function createContainer(): AppContainer {
  return { config, logger, parser: new TsCompilerParser() };
}
