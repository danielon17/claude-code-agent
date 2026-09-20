# infrastructure/testgen

- `VitestTestWriter.ts` — toma el código de test generado por el LLM para
  cada `CodeUnit` exportada, lo valida sintácticamente (parseo rápido con
  la TS Compiler API) y lo escribe junto al archivo fuente (o en
  `--output-dir`) siguiendo la convención `*.test.ts` de Vitest.
