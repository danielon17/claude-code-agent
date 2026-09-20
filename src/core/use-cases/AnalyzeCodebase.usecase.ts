import type { CodeParser } from '../ports/CodeParser.port.js';
import type { LlmClient } from '../ports/LlmClient.port.js';
import type { AnalysisFinding, AnalysisResult, Severity } from '../entities/AnalysisResult.js';
import { chunkCodeUnits } from '../services/AstChunker.js';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt, parseFindingsResponse } from '../services/PromptTemplates.js';

export interface AnalyzeCodebaseInput {
  targetPath: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  /** Presupuesto de tokens por chunk enviado al modelo (ver `AstChunker`). */
  maxTokensPerChunk?: number;
  /** Notifica hitos del análisis (parsing, chunk N/M) para feedback en la terminal. */
  onProgress?: (message: string) => void;
  /** Recibe cada delta de texto streameado por Claude, para pintarlo en tiempo real. */
  onToken?: (text: string) => void;
}

const DEFAULT_MAX_TOKENS_PER_CHUNK = 4000;

/**
 * Orquesta: parseo AST del target -> chunking por presupuesto de tokens ->
 * un análisis semántico vía Claude (streaming) por chunk -> agregación de
 * hallazgos en un único `AnalysisResult`. Depende solo de los puertos
 * `CodeParser` y `LlmClient`, nunca de sus implementaciones concretas.
 */
export class AnalyzeCodebaseUseCase {
  constructor(
    private readonly parser: CodeParser,
    private readonly llm: LlmClient,
  ) {}

  async execute(input: AnalyzeCodebaseInput): Promise<AnalysisResult> {
    const maxTokensPerChunk = input.maxTokensPerChunk ?? DEFAULT_MAX_TOKENS_PER_CHUNK;

    input.onProgress?.(`Extrayendo AST de ${input.targetPath}...`);
    const units = await this.parser.parse(input.targetPath, {
      includePatterns: input.includePatterns,
      excludePatterns: input.excludePatterns,
    });

    if (units.length === 0) {
      return {
        targetPath: input.targetPath,
        analyzedAt: new Date().toISOString(),
        unitsAnalyzed: 0,
        findings: [],
        summary: 'No se encontraron unidades de código analizables en el target indicado.',
      };
    }

    const chunks = chunkCodeUnits(units, { maxTokensPerChunk });
    input.onProgress?.(`${units.length} unidad(es) de código en ${chunks.length} chunk(s). Iniciando análisis semántico...`);

    const findings: AnalysisFinding[] = [];
    for (const [index, chunk] of chunks.entries()) {
      input.onProgress?.(
        `Analizando chunk ${index + 1}/${chunks.length} (${chunk.units.length} unidad(es), ~${chunk.totalTokens} tokens estimados)...`,
      );

      let fullText = '';
      for await (const event of this.llm.streamCompletion(
        [{ role: 'user', content: buildAnalysisUserPrompt(chunk.units) }],
        { system: ANALYSIS_SYSTEM_PROMPT },
      )) {
        if (event.type === 'text') {
          input.onToken?.(event.text);
        } else if (event.type === 'done') {
          fullText = event.fullText;
        }
      }

      findings.push(...parseFindingsResponse(fullText, chunk.units));
    }

    return {
      targetPath: input.targetPath,
      analyzedAt: new Date().toISOString(),
      unitsAnalyzed: units.length,
      findings,
      summary: buildSummary(units.length, findings),
    };
  }
}

/** Resumen agregado localmente a partir de los hallazgos (sin una llamada extra al LLM): determinista, barato y fácil de testear. */
function buildSummary(unitsAnalyzed: number, findings: readonly AnalysisFinding[]): string {
  if (findings.length === 0) {
    return `Se analizaron ${unitsAnalyzed} unidad(es) de código y no se encontraron problemas relevantes.`;
  }

  const bySeverity = findings.reduce<Record<Severity, number>>(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { info: 0, warning: 0, critical: 0 },
  );

  return (
    `Se analizaron ${unitsAnalyzed} unidad(es) de código y se encontraron ${findings.length} hallazgo(s): ` +
    `${bySeverity.critical} crítico(s), ${bySeverity.warning} advertencia(s), ${bySeverity.info} informativo(s).`
  );
}
