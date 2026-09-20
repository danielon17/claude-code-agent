import type { OutputFormat, OutputFormatter } from '../../core/ports/OutputFormatter.port.js';
import { TerminalFormatter } from './TerminalFormatter.js';
import { JsonFormatter } from './JsonFormatter.js';
import { MarkdownFormatter } from './MarkdownFormatter.js';

/** Factory que resuelve el `--format` del CLI al adaptador de `OutputFormatter` correspondiente. */
export function createFormatter(format: OutputFormat): OutputFormatter {
  switch (format) {
    case 'json':
      return new JsonFormatter();
    case 'markdown':
      return new MarkdownFormatter();
    case 'text':
      return new TerminalFormatter();
  }
}
