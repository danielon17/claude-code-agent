# claude-code-agent

Agente CLI de análisis y refactorización de código en tiempo real. Combina
parsing estático (TypeScript Compiler API) con análisis semántico vía la
API de Claude para detectar problemas de calidad, generar parches de
refactorización aplicables y crear tests unitarios automáticamente.

> Estado: los tres subcomandos (`analyze`, `refactor`, `generate-tests`)
> funcionan end-to-end contra la API real de Claude con streaming en
> tiempo real, y soportan salida en texto (con color), JSON o Markdown vía
> `--format`. Los 6 pasos del roadmap original están completos — ver
> [Roadmap](#roadmap).

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
│   │   ├── RefactorSuggestion.ts   # Sugerencia + unified diff
│   │   └── GeneratedTest.ts
│   ├── ports/                      # Contratos (hexagonal ports)
│   │   ├── CodeParser.port.ts
│   │   ├── LlmClient.port.ts       # Streaming + tokens
│   │   ├── OutputFormatter.port.ts
│   │   └── FileSystem.port.ts
│   ├── services/                   # Lógica de dominio pura (sin I/O)
│   │   ├── AstChunker.ts               # Chunking de CodeUnit[] por presupuesto de tokens
│   │   ├── LlmJsonResponse.ts          # Extracción tolerante del JSON de una respuesta del LLM
│   │   ├── PromptTemplates.ts          # Prompt de análisis + parseo/validación estricta
│   │   ├── RefactorPromptTemplates.ts  # Prompt de refactor + parseo/validación estricta
│   │   ├── GenerateTestsPromptTemplates.ts  # Prompt de generación de tests + parseo
│   │   └── DiffGenerator.ts            # Unified diff determinista + reemplazo de una unidad por línea
│   └── use-cases/                  # Los 3 implementados end-to-end
│       ├── AnalyzeCodebase.usecase.ts  # parseo -> chunking -> streaming -> hallazgos
│       ├── RefactorCode.usecase.ts     # parseo -> chunking -> streaming -> (--apply) escritura
│       └── GenerateTests.usecase.ts    # parseo -> agrupado por archivo -> streaming -> escritura
├── infrastructure/                 # Adaptadores (implementaciones concretas)
│   ├── parsing/                    # TsCompilerParser, TokenEstimator
│   ├── llm/                        # AnthropicClient (streaming real sobre @anthropic-ai/sdk)
│   ├── formatters/                 # TerminalFormatter, JsonFormatter, MarkdownFormatter
│   └── filesystem/                 # NodeFileSystem
├── shared/
│   ├── logger.ts                   # pino (structured logging)
│   ├── config.ts                   # zod env schema
│   └── errors.ts                   # jerarquía AppError
└── container.ts                    # Composition root (DI)
```

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
code-agent analyze <target> [--format text|json|markdown] [--output file] [--include ...] [--exclude ...] [--max-tokens N]
code-agent refactor <target> [--apply] [--format ...] [--output file] [--include ...] [--exclude ...] [--max-tokens N]
code-agent generate-tests <target> [--framework vitest|jest] [--output-dir dir] [--format ...] [--include ...] [--exclude ...]
```

- `analyze`: reporta hallazgos (complejidad, duplicación, naming, seguridad, performance, mantenibilidad) con severidad y ubicación exacta.
- `refactor`: dry-run por defecto (imprime el diff sugerido); `--apply` lo escribe directo sobre el archivo de origen.
- `generate-tests`: genera un archivo `*.generated.test.ts` por archivo fuente, cubriendo sus funciones exportadas (no unidades tipo `method`, que requerirían instanciar su clase).
- `--format text` (default) pinta en vivo los tokens de la respuesta de Claude en la terminal; con `json`/`markdown` la salida queda limpia para pipear a otra herramienta o pegar en una PR.
- Todos aceptan `--log-level` a nivel global.

## Roadmap

1. ✅ Estructura del proyecto, arquitectura hexagonal, CLI cableado con los 3 subcomandos.
2. ✅ `TsCompilerParser` + `AstChunker`: extracción real de `CodeUnit[]` (funciones, métodos, clases, interfaces, type aliases, arrow functions) vía TypeScript Compiler API, con detección de dependencias y chunking por presupuesto de tokens.
3. ✅ `AnthropicClient` (streaming real sobre `@anthropic-ai/sdk`) + `AnalyzeCodebaseUseCase` completo: cada chunk se envía a Claude, los tokens se pintan en la terminal a medida que llegan, y la respuesta JSON se valida estrictamente (zod) y se mapea a `AnalysisFinding[]`.
4. ✅ `DiffGenerator` + `RefactorCodeUseCase`: cada refactor se deriva a un unified diff determinista y, con `--apply`, se aplica sobre el archivo real por la ubicación exacta de la unidad (`NodeFileSystem`).
5. ✅ `GenerateTestsUseCase`: agrupa las funciones exportadas por archivo, le pide a Claude un archivo de test por grupo (streaming) y lo escribe junto al código fuente (o en `--output-dir`).
6. ✅ `TerminalFormatter` / `JsonFormatter` / `MarkdownFormatter`: `--format` controla la salida final de los tres comandos; `--output` la guarda en un archivo.

## Licencia

[MIT](./LICENSE)
