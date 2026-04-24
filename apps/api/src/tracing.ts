/**
 * OpenTelemetry SDK initialisation — must be imported before any other module.
 * Provides auto-instrumentation for Express, MongoDB, and HTTP clients.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { SimpleSpanProcessor, BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const isDev = process.env.NODE_ENV !== 'production';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const samplingRate = parseFloat(process.env.OTEL_SAMPLING_RATE ?? (isDev ? '1.0' : '0.1'));

const resource = new Resource({
  [ATTR_SERVICE_NAME]: 'health-watchers-api',
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '1.0.0',
  environment: process.env.NODE_ENV ?? 'development',
});

function buildExporter() {
  if (otlpEndpoint) {
    return new BatchSpanProcessor(new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }));
  }
  if (isDev) {
    return new SimpleSpanProcessor(new ConsoleSpanExporter());
  }
  return null;
}

const spanProcessor = buildExporter();

const sdk = new NodeSDK({
  resource,
  ...(spanProcessor ? { spanProcessors: [spanProcessor] } : {}),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
      '@opentelemetry/instrumentation-http': {
        headersToSpanAttributes: {
          server: { requestHeaders: ['x-request-id', 'traceparent'] },
        },
      },
    }),
  ],
  // Head-based sampling: keep samplingRate fraction of traces
  sampler: {
    shouldSample: () => ({
      decision: Math.random() < samplingRate ? 1 : 0, // 1=RECORD_AND_SAMPLED, 0=NOT_RECORD
    }),
    toString: () => `ProbabilitySampler(${samplingRate})`,
  },
});

sdk.start();

process.on('SIGTERM', () => sdk.shutdown());
process.on('SIGINT', () => sdk.shutdown());
