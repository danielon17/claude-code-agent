/**
 * Estimación rápida de tokens sin llamar a la API, usada para decisiones de
 * chunking locales. El conteo exacto (más costoso, requiere red) se
 * consulta vía `LlmClient.countTokens` solo justo antes de una llamada real
 * al modelo, no durante el chunking masivo de un repositorio completo.
 *
 * 3.8 caracteres/token es una aproximación razonable para código fuente en
 * inglés/español con el tokenizador de Claude; sobreestimar levemente es
 * preferible a subestimar y exceder la ventana de contexto.
 */
const AVERAGE_CHARS_PER_TOKEN = 3.8;

export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / AVERAGE_CHARS_PER_TOKEN);
}
