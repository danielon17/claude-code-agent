# infrastructure/parsing

Adaptador de `CodeParser` (core/ports/CodeParser.port.ts).

- `TsCompilerParser.ts` — usa la TypeScript Compiler API (`ts.createProgram`,
  `ts.forEachChild`) para recorrer el AST y extraer `CodeUnit[]`
  (funciones, métodos, clases) con su texto fuente y ubicación exacta.
- `AstChunker.ts` — agrupa `CodeUnit[]` en chunks que no excedan el límite
  de tokens configurado, preservando unidades completas (nunca corta una
  función a la mitad) y priorizando por complejidad ciclomática.
- `TokenEstimator.ts` — estimación rápida de tokens (heurística de
  caracteres) usada antes de llamar a `LlmClient.countTokens`.
