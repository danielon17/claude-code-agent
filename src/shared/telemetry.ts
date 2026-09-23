import { SpanStatusCode, type Span, type SpanAttributes, type Tracer } from '@opentelemetry/api';
import { BatchSpanProcessor, NodeTracerProvider, type SpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const SERVICE_NAME = 'claude-code-agent';
const SERVICE_VERSION = '0.1.0';

export interface TelemetryOptions {
  /** Endpoint OTLP/HTTP (`OTEL_EXPORTER_OTLP_ENDPOINT`). Sin configurar, los spans se crean pero no se exportan a ningún colector. */
  exporterEndpoint?: string;
  /** Override para tests: inyectar span processors propios (p.ej. sobre un `InMemorySpanExporter`) en vez de resolverlos desde `exporterEndpoint`. */
  spanProcessors?: SpanProcessor[];
}

export interface Telemetry {
  tracer: Tracer;
  /**
   * Envuelve `fn` en un span: marca `OK`/`ERROR` según el resultado,
   * registra la excepción si rechaza, y siempre cierra el span (incluso
   * si `fn` lanza). No swallowea errores — los vuelve a lanzar tras
   * instrumentarlos, para no alterar el comportamiento del código real.
   */
  withSpan<T>(name: string, fn: (span: Span) => Promise<T>, attributes?: SpanAttributes): Promise<T>;
  /** Fuerza el flush de spans pendientes y libera el provider. Llamar al final de la ejecución del CLI. */
  shutdown(): Promise<void>;
}

/**
 * Composition root de telemetría (tracing distribuido, OpenTelemetry).
 * Sin `OTEL_EXPORTER_OTLP_ENDPOINT` configurado, es efectivamente un no-op
 * de bajo costo: los spans se crean (así los tests pueden verificarlos con
 * un exporter en memoria) pero no hay ningún span processor que los envíe
 * a ningún lado, así que no hay overhead de red ni dependencia de un
 * colector para poder correr el CLI.
 *
 * Deliberadamente NO se registra como provider global de
 * `@opentelemetry/api` (`provider.register()`): esta es una herramienta
 * embebida, no un servicio de larga vida, así que usamos la instancia del
 * provider directamente para obtener el tracer en vez de mutar estado
 * global del proceso.
 */
export function createTelemetry(options: TelemetryOptions = {}): Telemetry {
  const spanProcessors =
    options.spanProcessors ??
    (options.exporterEndpoint
      ? [new BatchSpanProcessor(new OTLPTraceExporter({ url: options.exporterEndpoint }))]
      : []);

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    }),
    spanProcessors,
  });

  const tracer = provider.getTracer(SERVICE_NAME, SERVICE_VERSION);

  async function withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    attributes?: SpanAttributes,
  ): Promise<T> {
    return tracer.startActiveSpan(name, async (span) => {
      if (attributes) {
        span.setAttributes(attributes);
      }
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  return {
    tracer,
    withSpan,
    shutdown: () => provider.shutdown(),
  };
}
