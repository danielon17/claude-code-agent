# claude-code-agent

[![CI](https://github.com/danielon17/claude-code-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/danielon17/claude-code-agent/actions/workflows/ci.yml)

Agente CLI de análisis y refactorización de código en tiempo real. Combina
parsing estático (TypeScript Compiler API) con análisis semántico vía la
API de Claude para detectar problemas de calidad, generar parches de
refactorización aplicables y crear tests unitarios automáticamente.

> Estado: los tres subcomandos (`analyze`, `refactor`, `generate-tests`)
> funcionan end-to-end contra la API real de Claude con streaming en
> tiempo real, y soportan salida en texto (con color), JSON o Markdown vía
> `--format`. Los 6 pasos del roadmap original están completos, y el
> proyecto tiene un pase de hardening a nivel producción — ver
> [Roadmap](#roadmap) y [Resiliencia y seguridad](#resiliencia-y-seguridad).

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
│   ├── logger.ts                   # pino (structured logging, redacción de secretos)
│   ├── config.ts                   # zod env schema (incl. tuning de retry/rate-limit)
│   ├── errors.ts                   # jerarquía AppError
│   ├── retry.ts                    # Backoff exponencial + jitter genérico
│   └── rateLimiter.ts              # Espaciador de llamadas salientes
└── container.ts                    # Composition root (DI) — runId por ejecución, wiring de resiliencia
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

## Resiliencia y seguridad

- **Reintentos con backoff exponencial**: `AnthropicClient` reintenta automáticamente (hasta `ANTHROPIC_MAX_RETRIES`, default 3) ante timeouts, `429` o `5xx`. Los errores 4xx de validación/auth (`400`, `401`, `403`...) **no** se reintentan, porque insistir no los va a resolver. En streaming, solo se reintenta si todavía no se emitió ningún token al usuario: una vez que empezaste a ver texto en la terminal, reintentar desde cero produciría una respuesta duplicada, así que ahí el error se propaga tal cual.
- **Rate limiting**: cada request saliente a Claude pasa por un `RateLimiter` que puede espaciar llamadas (`ANTHROPIC_MIN_REQUEST_INTERVAL_MS`, default 0/desactivado) para no exceder el límite de RPM de la cuenta al analizar repositorios grandes con muchos chunks. Es un espaciador simple, no una cola con concurrencia: las llamadas del CLI ya son secuenciales por diseño (una por chunk, para poder streamear al usuario en orden), así que no hay llamadas en paralelo que arbitrar.
- **Logging estructurado y trazabilidad**: cada invocación del CLI genera un `runId` corto (`container.ts`) que se adjunta a *todas* las líneas de log de esa corrida (`logger.child`), para poder correlacionar el output de una ejecución en un log agregado. El logger redacta (`pino.redact`) cualquier campo que pudiera contener una API key, como defensa en profundidad además de que el código nunca loguea `ANTHROPIC_API_KEY` directamente.
- **Validación estricta de entrada**: `--format` y `--framework` son enums cerrados a nivel de Commander (`Option#choices`, rechaza cualquier otro valor con un mensaje claro antes de ejecutar nada); `--max-tokens` se valida como entero positivo; toda la configuración de entorno se valida con `zod` al arrancar (falla rápido con un mensaje claro, en vez de propagar `undefined`).
- **Gestión de secretos**: `ANTHROPIC_API_KEY` solo se lee de variables de entorno (nunca hardcodeada, nunca committeada — `.env` está en `.gitignore`); `createLlmClient()` es perezoso, así que comandos que todavía no usan el LLM no fallan por una key ausente que no necesitan.
- **Por qué no hay sandboxing de red/filesystem adicional**: este es un CLI que un desarrollador corre localmente sobre su propio código, con sus propios permisos de OS — restringir a qué archivos puede acceder sería contraproducente (el usuario le pide explícitamente que lea/escriba en rutas de su elección, incluyendo `--output`/`--output-dir`). Si se necesita aislamiento real (ejecutarlo en CI o en un entorno no confiable), la imagen Docker multi-stage (ver abajo) corre como usuario no-root y sin herramientas de build, que es el mecanismo de aislamiento apropiado para esta clase de herramienta.

## Docker

```bash
docker build -t claude-code-agent .
docker run --rm -e ANTHROPIC_API_KEY=sk-ant-... -v "$(pwd)":/workspace claude-code-agent analyze /workspace/src
```

El `Dockerfile` usa *multi-stage build*: una etapa instala dependencias y compila, otra instala *solo* las dependencias de producción, y la imagen final (`node:20-alpine`) copia únicamente `dist/` + `node_modules` de producción, corre como usuario no-root (`app`) y no incluye TypeScript, ESLint, Vitest ni el código fuente.

## CI/CD

`.github/workflows/ci.yml` corre en cada Pull Request y push a `master`/`main`, contra Node 20.x y 22.x: `lint` → `typecheck` → `test:coverage` (falla si baja del 80%) → `build`, más un job separado que valida que la imagen Docker compila. Un PR no es mergeable de buena fe si algo de esto falla.

## Roadmap

1. ✅ Estructura del proyecto, arquitectura hexagonal, CLI cableado con los 3 subcomandos.
2. ✅ `TsCompilerParser` + `AstChunker`: extracción real de `CodeUnit[]` (funciones, métodos, clases, interfaces, type aliases, arrow functions) vía TypeScript Compiler API, con detección de dependencias y chunking por presupuesto de tokens.
3. ✅ `AnthropicClient` (streaming real sobre `@anthropic-ai/sdk`) + `AnalyzeCodebaseUseCase` completo: cada chunk se envía a Claude, los tokens se pintan en la terminal a medida que llegan, y la respuesta JSON se valida estrictamente (zod) y se mapea a `AnalysisFinding[]`.
4. ✅ `DiffGenerator` + `RefactorCodeUseCase`: cada refactor se deriva a un unified diff determinista y, con `--apply`, se aplica sobre el archivo real por la ubicación exacta de la unidad (`NodeFileSystem`).
5. ✅ `GenerateTestsUseCase`: agrupa las funciones exportadas por archivo, le pide a Claude un archivo de test por grupo (streaming) y lo escribe junto al código fuente (o en `--output-dir`).
6. ✅ `TerminalFormatter` / `JsonFormatter` / `MarkdownFormatter`: `--format` controla la salida final de los tres comandos; `--output` la guarda en un archivo.
7. ✅ Hardening a nivel producción: retry con backoff exponencial + rate limiting en `AnthropicClient`, logging correlacionado por ejecución (`runId`) con redacción de secretos, validación estricta de opciones del CLI (`Option#choices`), `Dockerfile` multi-stage (imagen final sin herramientas de build, usuario no-root) y CI en GitHub Actions (lint + typecheck + test + build + docker build en cada PR).

## Licencia

[MIT](./LICENSE)
