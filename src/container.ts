import { config, type AppConfig } from './shared/config.js';
import { logger, type Logger } from './shared/logger.js';

/**
 * Composition root: único lugar donde se construyen e inyectan las
 * implementaciones concretas de los puertos hexagonales. Los comandos del
 * CLI obtienen sus dependencias de aquí en vez de instanciarlas ellos
 * mismos, para mantener la capa de interfaz desacoplada de infraestructura.
 *
 * TODO: a medida que se implementen los adaptadores concretos
 * (TsCompilerParser, AnthropicClient, TerminalFormatter, NodeFileSystem),
 * se registran y exponen aquí junto con los use cases ya cableados.
 */
export interface AppContainer {
  config: AppConfig;
  logger: Logger;
}

export function createContainer(): AppContainer {
  return { config, logger };
}
