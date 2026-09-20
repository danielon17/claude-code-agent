# claude-code-agent

Agente CLI de análisis y refactorización de código en tiempo real. Combina
parsing estático (TypeScript Compiler API) con análisis semántico vía la
API de Claude para detectar problemas de calidad, generar parches de
refactorización aplicables y crear tests unitarios automáticamente.

> Estado: **scaffold inicial**. La arquitectura, el CLI y los contratos
> (puertos/entidades) están completos y funcionando end-to-end; los
> adaptadores de infraestructura (parser real, cliente de Claude, diff,
> formatters) se implementan paso a paso — ver [Roadmap](#roadmap).

## Arquitectura

Hexagonal / Clean Architecture: el dominio (`core/`) no conoce Commander,
Node.js `fs` ni el SDK de Anthropic. Todo lo externo se accede a través de
puertos (`core/ports/*.port.ts`), implementados por adaptadores en
`infrastructure/`.

```
src/
├── cli.ts                          # Entry point: Commander + registro de comandos
├── commands/                       # Adaptador de entrada (interfaz CLI)
│   ├── analyze.command.ts
│   ├── refactor.command.ts
│   └── generate-tests.command.ts
├── core/                           # Dominio (sin dependencias de I/O)
│   ├── entities/
│   │   ├── CodeUnit.ts             # Unidad de código extraída del AST
│   │   ├── AnalysisResult.ts
│   │   ├── RefactorSuggestion.ts   # Sugerencia como unified diff
│   │   └── GeneratedTest.ts
│   ├── ports/                      # Contratos (hexagonal ports)
│   │   ├── CodeParser.port.ts
│   │   ├── LlmClient.port.ts       # Streaming + tokens
│   │   ├── OutputFormatter.port.ts
│   │   └── FileSystem.port.ts
│   └── use-cases/
│       ├── AnalyzeCodebase.usecase.ts
│       ├── RefactorCode.usecase.ts
│       └── GenerateTests.usecase.ts
├── infrastructure/                 # Adaptadores (implementaciones concretas)
│   ├── parsing/                    # TsCompilerParser, AstChunker, TokenEstimator
│   ├── llm/                        # AnthropicClient, PromptTemplates, ContextWindowManager
│   ├── diff/                       # DiffGenerator (unified diff / apply)
│   ├── testgen/                    # VitestTestWriter
│   ├── formatters/                 # Terminal, JSON, Markdown
│   └── filesystem/                 # NodeFileSystem
├── shared/
│   ├── logger.ts                   # pino (structured logging)
│   ├── config.ts                   # zod env schema
│   └── errors.ts                   # jerarquía AppError
└── container.ts                    # Composition root (DI)
```

Cada carpeta de `infrastructure/` trae un `TODO.md` con la responsabilidad
exacta del adaptador que falta implementar ahí.

## Quickstart

```bash
npm install
cp .env.example .env   # y completar ANTHROPIC_API_KEY
npm run dev -- analyze ./src
```

## Scripts

| Script                  | Descripción                                   |
| ------------------------ | ---------------------------------------------- |
| `npm run dev`            | Ejecuta el CLI en TypeScript directo (`tsx`)   |
| `npm run build`           | Compila a `dist/` con `tsc`                    |
| `npm start`              | Ejecuta el CLI ya compilado                    |
| `npm test`               | Corre la suite de Vitest                       |
| `npm run test:coverage`  | Corre tests con reporte de cobertura (≥80%)    |
| `npm run lint`           | ESLint sobre `src/` y `tests/`                 |
| `npm run typecheck`      | `tsc --noEmit`                                 |

## Comandos del CLI

```bash
code-agent analyze <target> [--format text|json|markdown] [--include ...] [--exclude ...]
code-agent refactor <target> [--apply] [--format ...]
code-agent generate-tests <target> [--framework vitest|jest] [--output-dir ...]
```

Todos aceptan `--log-level` a nivel global.

## Roadmap

1. ✅ Estructura del proyecto, arquitectura hexagonal, CLI cableado con los 3 subcomandos.
2. ⏳ `TsCompilerParser` + `AstChunker`: extracción real de `CodeUnit[]` vía TypeScript Compiler API y chunking por límite de tokens.
3. ⏳ `AnthropicClient` con streaming real hacia Claude y `AnalyzeCodebaseUseCase` completo.
4. ⏳ `DiffGenerator` + `RefactorCodeUseCase`: generación y aplicación de parches `.diff`.
5. ⏳ `VitestTestWriter` + `GenerateTestsUseCase`: generación automática de tests.
6. ⏳ Formatters (`TerminalFormatter`, `JsonFormatter`, `MarkdownFormatter`) y cobertura de tests ≥80%.
