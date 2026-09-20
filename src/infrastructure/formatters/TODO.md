# infrastructure/formatters

Adaptadores de `OutputFormatter` (core/ports/OutputFormatter.port.ts).

- `TerminalFormatter.ts` — salida enriquecida con `chalk`/`ora`: colores
  por severidad, spinners durante el streaming, tablas resumen.
- `JsonFormatter.ts` — salida JSON estable pensada para consumo por CI/CD
  o por otras herramientas.
- `MarkdownFormatter.ts` — salida en Markdown pensada para pegar en
  descripciones de Pull Requests.
