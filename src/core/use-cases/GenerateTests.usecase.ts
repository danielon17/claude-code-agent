import path from 'node:path';
import type { CodeParser } from '../ports/CodeParser.port.js';
import type { LlmClient } from '../ports/LlmClient.port.js';
import type { FileSystemPort } from '../ports/FileSystem.port.js';
import type { CodeUnit, CodeUnitKind } from '../entities/CodeUnit.js';
import type { GeneratedTest, TestFramework } from '../entities/GeneratedTest.js';
import { chunkCodeUnits } from '../services/AstChunker.js';
import {
  buildGenerateTestsSystemPrompt,
  buildGenerateTestsUserPrompt,
  parseGenerateTestsResponse,
} from '../services/GenerateTestsPromptTemplates.js';

export interface GenerateTestsInput {
  targetPath: string;
  framework: TestFramework;
  outputDir?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  maxTokensPerChunk?: number;
  onProgress?: (message: string) => void;
  onToken?: (text: string) => void;
}

const DEFAULT_MAX_TOKENS_PER_CHUNK = 4000;

/** Unidades con firma directamente importable por nombre; los métodos requerirían instanciar su clase, fuera de alcance de esta generación automática. */
const TESTABLE_KINDS: ReadonlySet<CodeUnitKind> = new Set(['function', 'arrow-function']);

/**
 * Orquesta: parseo AST -> filtrado a unidades testeables -> agrupamiento
 * por archivo fuente -> chunking por tokens -> generación de un archivo
 * de test por chunk vía Claude (streaming) -> escritura en disco.
 */
export class GenerateTestsUseCase {
  constructor(
    private readonly parser: CodeParser,
    private readonly llm: LlmClient,
    private readonly fileSystem: FileSystemPort,
  ) {}

  async execute(input: GenerateTestsInput): Promise<GeneratedTest[]> {
    const maxTokensPerChunk = input.maxTokensPerChunk ?? DEFAULT_MAX_TOKENS_PER_CHUNK;

    input.onProgress?.(`Extrayendo AST de ${input.targetPath}...`);
    const allUnits = await this.parser.parse(input.targetPath, {
      includePatterns: input.includePatterns,
      excludePatterns: input.excludePatterns,
    });
    const testableUnits = allUnits.filter((unit) => TESTABLE_KINDS.has(unit.kind));

    if (testableUnits.length === 0) {
      return [];
    }

    const unitsByFile = groupByFile(testableUnits);
    input.onProgress?.(`${testableUnits.length} función(es) testeable(s) en ${unitsByFile.size} archivo(s). Generando tests...`);

    const generatedTests: GeneratedTest[] = [];
    let fileIndex = 0;

    for (const [sourceFilePath, units] of unitsByFile) {
      fileIndex += 1;
      input.onProgress?.(`Generando tests para ${sourceFilePath} (${fileIndex}/${unitsByFile.size})...`);

      const chunks = chunkCodeUnits(units, { maxTokensPerChunk });
      for (const [chunkIndex, chunk] of chunks.entries()) {
        const part = chunks.length > 1 ? chunkIndex : undefined;
        const suggestedFilePath = buildSuggestedTestFilePath(sourceFilePath, input.outputDir, part);
        const importPath = buildImportPath(sourceFilePath, suggestedFilePath);

        let fullText = '';
        for await (const event of this.llm.streamCompletion(
          [{ role: 'user', content: buildGenerateTestsUserPrompt(chunk.units, importPath) }],
          { system: buildGenerateTestsSystemPrompt(input.framework) },
        )) {
          if (event.type === 'text') {
            input.onToken?.(event.text);
          } else if (event.type === 'done') {
            fullText = event.fullText;
          }
        }

        const sourceCode = parseGenerateTestsResponse(fullText);
        await this.fileSystem.writeFile(suggestedFilePath, sourceCode);

        generatedTests.push({
          id: `${suggestedFilePath}#${chunkIndex}`,
          unitIds: chunk.units.map((unit) => unit.id),
          framework: input.framework,
          suggestedFilePath,
          sourceCode,
        });
      }
    }

    return generatedTests;
  }
}

function groupByFile(units: readonly CodeUnit[]): Map<string, CodeUnit[]> {
  const map = new Map<string, CodeUnit[]>();
  for (const unit of units) {
    const list = map.get(unit.location.filePath) ?? [];
    list.push(unit);
    map.set(unit.location.filePath, list);
  }
  return map;
}

function buildSuggestedTestFilePath(sourceFilePath: string, outputDir: string | undefined, chunkIndex?: number): string {
  const parsed = path.parse(sourceFilePath);
  const suffix = chunkIndex === undefined ? '' : `.part${chunkIndex + 1}`;
  const fileName = `${parsed.name}${suffix}.generated.test${parsed.ext}`;
  return path.join(outputDir ?? parsed.dir, fileName);
}

/** Ruta de import relativa (estilo ESM/NodeNext, con extensión `.js`) desde el archivo de test hacia el archivo fuente. */
function buildImportPath(sourceFilePath: string, testFilePath: string): string {
  const sourceBase = path.basename(sourceFilePath, path.extname(sourceFilePath));
  const relativeDir = path.relative(path.dirname(testFilePath), path.dirname(sourceFilePath));
  const joined = path.join(relativeDir || '.', `${sourceBase}.js`).split(path.sep).join('/');
  return joined.startsWith('.') ? joined : `./${joined}`;
}
