import { stat } from 'node:fs/promises';
import type { Command } from 'commander';
import { createContainer, type AppContainer } from '../container.js';
import { isAppError } from '../shared/errors.js';
import { chunkCodeUnits } from '../infrastructure/parsing/AstChunker.js';
import type { CodeUnitKind } from '../core/entities/CodeUnit.js';

export interface AnalyzeCliOptions {
  format: 'text' | 'json' | 'markdown';
  output?: string;
  include?: string[];
  exclude?: string[];
  maxTokens: string;
}

type AnalyzeCommandDeps = Pick<AppContainer, 'logger' | 'parser'>;

/**
 * Lógica del subcomando `analyze`, separada del registro en Commander para
 * poder testearla de forma aislada inyectando un container de prueba.
 *
 * La extracción de `CodeUnit[]` y el chunking por presupuesto de tokens ya
 * están implementados (paso 2 del roadmap); el análisis semántico vía
 * `AnalyzeCodebaseUseCase` + `AnthropicClient` con streaming llega en el
 * paso 3, así que por ahora este comando muestra qué se enviaría al modelo.
 */
export async function runAnalyzeCommand(
  target: string,
  options: AnalyzeCliOptions,
  { logger, parser }: AnalyzeCommandDeps,
): Promise<void> {
  try {
    logger.info({ target, options }, 'Iniciando análisis');

    const maxTokensPerChunk = Number.parseInt(options.maxTokens, 10);
    if (!Number.isFinite(maxTokensPerChunk) || maxTokensPerChunk <= 0) {
      throw new RangeError(`--max-tokens debe ser un entero positivo, recibido: "${options.maxTokens}"`);
    }

    const targetStat = await stat(target);
    const units = targetStat.isDirectory()
      ? await parser.parseDirectory(target, {
          includePatterns: options.include,
          excludePatterns: options.exclude,
        })
      : await parser.parseFile(target);

    const chunks = chunkCodeUnits(units, { maxTokensPerChunk });
    const byKind = units.reduce<Record<string, number>>((acc, unit) => {
      acc[unit.kind] = (acc[unit.kind] ?? 0) + 1;
      return acc;
    }, {});
    const totalTokens = units.reduce((sum, unit) => sum + unit.estimatedTokens, 0);

    logger.info(
      { unitsFound: units.length, byKind, chunks: chunks.length, totalTokens },
      `AST extraído: ${units.length} unidades de código en ${chunks.length} chunk(s) (~${totalTokens} tokens).`,
    );
    for (const [kind, count] of Object.entries(byKind) as Array<[CodeUnitKind, number]>) {
      logger.info(`  ${kind}: ${count}`);
    }

    logger.warn(
      'Análisis semántico vía Claude aún no implementado (AnalyzeCodebaseUseCase) — próximo paso del roadmap. Arriba se muestra el resultado real del parsing + chunking.',
    );
  } catch (error) {
    if (isAppError(error)) {
      logger.error({ code: error.code, err: error }, error.message);
    } else {
      logger.error({ err: error }, 'Error inesperado durante el análisis');
    }
    process.exitCode = 1;
  }
}

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description(
      'Analiza un archivo o directorio en busca de problemas de complejidad, duplicación, seguridad y mantenibilidad.',
    )
    .argument('<target>', 'Ruta al archivo o directorio a analizar')
    .option('-f, --format <format>', 'Formato de salida: text | json | markdown', 'text')
    .option('-o, --output <file>', 'Guardar el resultado en un archivo en lugar de stdout')
    .option('--include <patterns...>', 'Glob patterns a incluir (ej: "src/**/*.ts")')
    .option('--exclude <patterns...>', 'Glob patterns a excluir (ej: "**/*.test.ts")')
    .option('--max-tokens <number>', 'Límite de tokens por chunk enviado al modelo', '4000')
    .action(async (target: string, options: AnalyzeCliOptions) => {
      await runAnalyzeCommand(target, options, createContainer());
    });
}
