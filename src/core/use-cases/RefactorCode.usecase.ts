import type { CodeParser } from '../ports/CodeParser.port.js';
import type { LlmClient } from '../ports/LlmClient.port.js';
import type { FileSystemPort } from '../ports/FileSystem.port.js';
import type { CodeUnit } from '../entities/CodeUnit.js';
import type { RefactorSuggestion } from '../entities/RefactorSuggestion.js';
import { chunkCodeUnits } from '../services/AstChunker.js';
import { REFACTOR_SYSTEM_PROMPT, buildRefactorUserPrompt, parseRefactorResponse } from '../services/RefactorPromptTemplates.js';
import { applyRefactorToFileText } from '../services/DiffGenerator.js';

export interface RefactorCodeInput {
  targetPath: string;
  /** Si es `true`, escribe los refactors directamente sobre los archivos de origen. Por defecto es dry-run. */
  apply: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
  maxTokensPerChunk?: number;
  onProgress?: (message: string) => void;
  onToken?: (text: string) => void;
}

export interface RefactorCodeOutput {
  suggestions: RefactorSuggestion[];
  appliedCount: number;
}

const DEFAULT_MAX_TOKENS_PER_CHUNK = 4000;

/**
 * Orquesta: parseo AST -> chunking -> generación de refactors vía Claude
 * (streaming) -> (opcional) aplicación de cada refactor sobre el archivo
 * real, ubicándolo por la `SourceLocation` exacta de su `CodeUnit`.
 */
export class RefactorCodeUseCase {
  constructor(
    private readonly parser: CodeParser,
    private readonly llm: LlmClient,
    private readonly fileSystem: FileSystemPort,
  ) {}

  async execute(input: RefactorCodeInput): Promise<RefactorCodeOutput> {
    const maxTokensPerChunk = input.maxTokensPerChunk ?? DEFAULT_MAX_TOKENS_PER_CHUNK;

    input.onProgress?.(`Extrayendo AST de ${input.targetPath}...`);
    const units = await this.parser.parse(input.targetPath, {
      includePatterns: input.includePatterns,
      excludePatterns: input.excludePatterns,
    });

    if (units.length === 0) {
      return { suggestions: [], appliedCount: 0 };
    }

    const chunks = chunkCodeUnits(units, { maxTokensPerChunk });
    input.onProgress?.(`${units.length} unidad(es) de código en ${chunks.length} chunk(s). Generando refactors...`);

    const suggestions: RefactorSuggestion[] = [];
    for (const [index, chunk] of chunks.entries()) {
      input.onProgress?.(`Refactorizando chunk ${index + 1}/${chunks.length} (${chunk.units.length} unidad(es))...`);

      let fullText = '';
      for await (const event of this.llm.streamCompletion(
        [{ role: 'user', content: buildRefactorUserPrompt(chunk.units) }],
        { system: REFACTOR_SYSTEM_PROMPT },
      )) {
        if (event.type === 'text') {
          input.onToken?.(event.text);
        } else if (event.type === 'done') {
          fullText = event.fullText;
        }
      }

      suggestions.push(...parseRefactorResponse(fullText, chunk.units));
    }

    if (!input.apply || suggestions.length === 0) {
      return { suggestions, appliedCount: 0 };
    }

    const unitsById = new Map(units.map((unit) => [unit.id, unit]));
    const appliedCount = await this.applySuggestions(suggestions, unitsById);
    return { suggestions, appliedCount };
  }

  /** Aplica las sugerencias agrupadas por archivo, de la última a la primera línea, para que reemplazar un rango no invalide los offsets de los siguientes dentro del mismo archivo. */
  private async applySuggestions(
    suggestions: readonly RefactorSuggestion[],
    unitsById: ReadonlyMap<string, CodeUnit>,
  ): Promise<number> {
    const suggestionsByFile = new Map<string, RefactorSuggestion[]>();
    for (const suggestion of suggestions) {
      const list = suggestionsByFile.get(suggestion.filePath) ?? [];
      list.push(suggestion);
      suggestionsByFile.set(suggestion.filePath, list);
    }

    let appliedCount = 0;
    for (const [filePath, fileSuggestions] of suggestionsByFile) {
      let fileText = await this.fileSystem.readFile(filePath);

      const orderedByLineDescending = [...fileSuggestions].sort((a, b) => {
        const lineA = unitsById.get(a.unitId)?.location.startLine ?? 0;
        const lineB = unitsById.get(b.unitId)?.location.startLine ?? 0;
        return lineB - lineA;
      });

      for (const suggestion of orderedByLineDescending) {
        const unit = unitsById.get(suggestion.unitId);
        if (!unit) {
          continue;
        }
        fileText = applyRefactorToFileText(fileText, unit, suggestion.refactoredCode);
        appliedCount += 1;
      }

      await this.fileSystem.writeFile(filePath, fileText);
    }

    return appliedCount;
  }
}
