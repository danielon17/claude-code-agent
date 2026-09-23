import { describe, expect, it } from 'vitest';
import { SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { createTelemetry } from '../../../src/shared/telemetry.js';

function createInMemoryTelemetry() {
  const exporter = new InMemorySpanExporter();
  const telemetry = createTelemetry({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  return { telemetry, exporter };
}

describe('createTelemetry / withSpan', () => {
  it('crea un span con el nombre y los atributos dados, y lo marca OK si fn resuelve', async () => {
    const { telemetry, exporter } = createInMemoryTelemetry();

    const result = await telemetry.withSpan('cli.analyze', async () => 'ok', { 'run.id': 'abc123' });

    expect(result).toBe('ok');
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe('cli.analyze');
    expect(spans[0]?.attributes['run.id']).toBe('abc123');
    expect(spans[0]?.status.code).toBe(SpanStatusCode.OK);
  });

  it('marca el span como ERROR, registra la excepción y re-lanza si fn rechaza', async () => {
    const { telemetry, exporter } = createInMemoryTelemetry();
    const boom = new Error('boom');

    await expect(
      telemetry.withSpan('cli.refactor', async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0]?.status.message).toBe('boom');
    expect(spans[0]?.events.some((event) => event.name === 'exception')).toBe(true);
  });

  it('sin exporterEndpoint ni spanProcessors, no falla (no-op sin colector)', async () => {
    const telemetry = createTelemetry();
    await expect(telemetry.withSpan('cli.generate-tests', async () => 'x')).resolves.toBe('x');
    await expect(telemetry.shutdown()).resolves.toBeUndefined();
  });

  it('shutdown() no lanza incluso si ya no hay spans pendientes', async () => {
    const { telemetry } = createInMemoryTelemetry();
    await telemetry.withSpan('cli.analyze', async () => undefined);
    await expect(telemetry.shutdown()).resolves.toBeUndefined();
  });
});
