/**
 * OpenTelemetry SDK initialisation for stellar-service.
 * Must be imported before any other module.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const isDev = process.env.NODE_ENV !== 'production';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const samplingRate = parseFloat(process.env.OTEL_SAMPLING_RATE ?? (isDev ? '1.0' : '0.1'));

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'health-watchers-stellar-service',
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
      '@opentelemetry/instrumentation-fs': { enabled: false },
      // Capture W3C traceparent/tracestate from inbound requests for distributed tracing
      '@opentelemetry/instrumentation-http': {
        headersToSpanAttributes: {
          server: { requestHeaders: ['traceparent', 'tracestate', 'x-request-id'] },
        },
      },
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
