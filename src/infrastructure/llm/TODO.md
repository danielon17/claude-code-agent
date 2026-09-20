# infrastructure/llm

Adaptador de `LlmClient` (core/ports/LlmClient.port.ts).

- `AnthropicClient.ts` — envuelve `@anthropic-ai/sdk`. Implementa
  `streamCompletion` usando `client.messages.stream(...)` y reemite eventos
  `text`/`done`/`error` para que el CLI pinte tokens en tiempo real.
- `PromptTemplates.ts` — plantillas de prompt por caso de uso (análisis,
  refactor, generación de tests), con instrucciones de formato de salida
  estructurado (JSON/diff) para parseo determinista de la respuesta.
- `ContextWindowManager.ts` — decide cuántos `CodeUnit` caben en una sola
  llamada según el modelo activo, gestiona overlap de contexto entre
  chunks contiguos y arma el system prompt con reglas del proyecto.
