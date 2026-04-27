/**
 * OpenTelemetry SDK initialisation for stellar-service.
 * Must be imported before any other module.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor, SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const isDev = process.env.NODE_ENV !== 'production';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const samplingRate = parseFloat(process.env.OTEL_SAMPLING_RATE ?? (isDev ? '1.0' : '0.1'));

const resource = new Resource({
  [ATTR_SERVICE_NAME]: 'health-watchers-stellar-service',
  environment: process.env.NODE_ENV ?? 'development',
});

const spanProcessor = otlpEndpoint
  ? new BatchSpanProcessor(new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }))
  : isDev
    ? new SimpleSpanProcessor(new ConsoleSpanExporter())
    : null;

const sdk = new NodeSDK({
  resource,
  ...(spanProcessor ? { spanProcessors: [spanProcessor] } : {}),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
  sampler: {
    shouldSample: () => ({ decision: Math.random() < samplingRate ? 1 : 0 }),
    toString: () => `ProbabilitySampler(${samplingRate})`,
  },
});

sdk.start();
process.on('SIGTERM', () => sdk.shutdown());
process.on('SIGINT', () => sdk.shutdown());
