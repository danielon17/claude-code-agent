import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import ts from 'typescript';
import type { CodeParser, ParseOptions } from '../../core/ports/CodeParser.port.js';
import type { CodeUnit, CodeUnitKind, SourceLocation } from '../../core/entities/CodeUnit.js';
import { ParsingError } from '../../shared/errors.js';
import { estimateTokens } from './TokenEstimator.js';

const DEFAULT_INCLUDE_PATTERNS = ['**/*.ts', '**/*.tsx'];
const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.d.ts',
  '**/*.test.ts',
  '**/*.spec.ts',
];
const DEFAULT_MAX_FILE_SIZE_BYTES = 1_000_000;

/**
 * Adaptador de `CodeParser` sobre la TypeScript Compiler API. Recorre el
 * AST de cada archivo con `ts.forEachChild` (sin type-checker, solo
 * parsing sintáctico — más rápido y sin necesitar un `tsconfig.json`
 * válido del proyecto analizado) y extrae una `CodeUnit` por cada función,
 * método, clase, interfaz, type alias o función flecha exportable.
 */
export class TsCompilerParser implements CodeParser {
  async parseFile(filePath: string): Promise<CodeUnit[]> {
    const absolutePath = path.resolve(filePath);
    let sourceText: string;
    try {
      sourceText = await readFile(absolutePath, 'utf-8');
    } catch (error) {
      throw new ParsingError(`No se pudo leer el archivo: ${absolutePath}`, error);
    }
    return this.parseSource(absolutePath, sourceText);
  }

  async parseDirectory(dirPath: string, options: ParseOptions = {}): Promise<CodeUnit[]> {
    const includePatterns = options.includePatterns ?? DEFAULT_INCLUDE_PATTERNS;
    const excludePatterns = options.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS;
    const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
    const absoluteDir = path.resolve(dirPath);

    let filePaths: string[];
    try {
      filePaths = await fg(includePatterns, {
        cwd: absoluteDir,
        ignore: excludePatterns,
        absolute: true,
        onlyFiles: true,
        dot: false,
      });
    } catch (error) {
      throw new ParsingError(`No se pudo listar el directorio: ${absoluteDir}`, error);
    }

    const units: CodeUnit[] = [];
    for (const filePath of filePaths.sort()) {
      const fileStat = await stat(filePath);
      if (fileStat.size > maxFileSizeBytes) {
        continue;
      }
      const sourceText = await readFile(filePath, 'utf-8');
      units.push(...this.parseSource(filePath, sourceText));
    }
    return units;
  }

  private parseSource(filePath: string, sourceText: string): CodeUnit[] {
    const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    let sourceFile: ts.SourceFile;
    try {
      sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
    } catch (error) {
      throw new ParsingError(`No se pudo parsear el archivo: ${filePath}`, error);
    }

    const importedNames = collectImportedNames(sourceFile);
    const units: CodeUnit[] = [];

    const visit = (node: ts.Node, enclosingClassName?: string): void => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        units.push(this.buildUnit(sourceFile, node, 'function', node.name.text, importedNames));
      } else if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        units.push(this.buildUnit(sourceFile, node, 'class', className, importedNames));
        for (const member of node.members) {
          visit(member, className);
        }
        return;
      } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        const name = enclosingClassName ? `${enclosingClassName}.${node.name.text}` : node.name.text;
        units.push(this.buildUnit(sourceFile, node, 'method', name, importedNames));
      } else if (ts.isInterfaceDeclaration(node)) {
        units.push(this.buildUnit(sourceFile, node, 'interface', node.name.text, importedNames));
      } else if (ts.isTypeAliasDeclaration(node)) {
        units.push(this.buildUnit(sourceFile, node, 'type-alias', node.name.text, importedNames));
      } else if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (
            declaration.initializer &&
            ts.isArrowFunction(declaration.initializer) &&
            ts.isIdentifier(declaration.name)
          ) {
            units.push(
              this.buildUnit(sourceFile, declaration.initializer, 'arrow-function', declaration.name.text, importedNames),
            );
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, enclosingClassName));
    };

    visit(sourceFile);
    return units;
  }

  private buildUnit(
    sourceFile: ts.SourceFile,
    node: ts.Node,
    kind: CodeUnitKind,
    name: string,
    importedNames: ReadonlySet<string>,
  ): CodeUnit {
    const location = toSourceLocation(sourceFile, node);
    const sourceText = node.getText(sourceFile).trim();
    return {
      id: `${sourceFile.fileName}#${name}@${location.startLine}:${location.startColumn}`,
      kind,
      name,
      sourceText,
      location,
      estimatedTokens: estimateTokens(sourceText),
      dependencies: collectDependencies(node, importedNames),
    };
  }
}

function toSourceLocation(sourceFile: ts.SourceFile, node: ts.Node): SourceLocation {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    filePath: sourceFile.fileName,
    startLine: start.line + 1,
    endLine: end.line + 1,
    startColumn: start.character + 1,
    endColumn: end.character + 1,
  };
}

function collectImportedNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) {
      continue;
    }
    const clause = statement.importClause;
    if (clause.name) {
      names.add(clause.name.text);
    }
    if (clause.namedBindings) {
      if (ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          names.add(element.name.text);
        }
      } else if (ts.isNamespaceImport(clause.namedBindings)) {
        names.add(clause.namedBindings.name.text);
      }
    }
  }
  return names;
}

/** Referencias a símbolos importados que aparecen dentro de la unidad (para trazar acoplamiento entre chunks). */
function collectDependencies(node: ts.Node, importedNames: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  const visit = (current: ts.Node): void => {
    if (ts.isIdentifier(current) && importedNames.has(current.text)) {
      found.add(current.text);
    }
    ts.forEachChild(current, visit);
  };
  ts.forEachChild(node, visit);
  return [...found].sort();
}
