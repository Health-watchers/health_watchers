/**
 * Unit tests for tracer.ts
 *
 * Without a registered OpenTelemetry SDK provider, @opentelemetry/api returns a
 * no-op tracer. These tests validate `withSpan` orchestration and the no-span
 * behaviour of `currentTraceId`.
 */
import { currentTraceId, withSpan, tracer } from './tracer';

describe('withSpan', () => {
  it('returns the result of the wrapped function', async () => {
    const result = await withSpan('test-op', { attr: 'value' }, async () => 'done');
    expect(result).toBe('done');
  });

  it('records error and rethrows when the function rejects', async () => {
    const boom = new Error('boom');
    await expect(
      withSpan('failing-op', {}, async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
  });

  it('exposes the active span to the wrapped function', async () => {
    const seen = await withSpan('span-op', {}, (span) => {
      span.setAttribute('k', 'v');
      return Promise.resolve(span);
    });
    expect(seen).toBeDefined();
    // @opentelemetry/api spans expose isRecording() as a method
    expect(typeof seen.isRecording).toBe('function');
  });
});

describe('tracer', () => {
  it('is a named tracer instance', () => {
    expect(tracer).toBeDefined();
    expect(typeof tracer.startActiveSpan).toBe('function');
  });
});

describe('currentTraceId', () => {
  it('returns undefined when there is no active span', () => {
    expect(currentTraceId()).toBeUndefined();
  });
});
