# ADR-011: Observability and Monitoring

## Status

Accepted

## Date

2024-04-20

## Context

A HIPAA-regulated healthcare platform requires robust observability to:

- Detect and diagnose performance regressions and outages quickly
- Provide tamper-evident audit trails required by HIPAA § 164.312(b)
- Alert on-call engineers before users are affected
- Correlate a user-reported error with the exact log entry and trace
- Ensure PHI never flows into third-party monitoring systems

Three observability pillars are needed: **logs**, **traces**, and **metrics**.

## Decision

### Pillar 1 — Structured Logging (Pino)

**Pino** is chosen as the structured JSON logger for its benchmark-leading throughput (the fastest Node.js logger).

Configuration (`apps/api/src/utils/logger.ts`):

- **Production**: JSON output to stdout, consumed by the ELK stack (Elasticsearch → Logstash → Kibana) via docker-compose or a Kubernetes log aggregator.
- **Development**: `pino-pretty` transport for human-readable colourised output.
- **Log level**: configurable via `LOG_LEVEL` env var (default `info`).
- **PHI redaction**: Pino's `redact` option censors sensitive paths at the serialiser level — `req.headers.authorization`, `body.password`, `body.refreshToken`, `body.cardNumber`, etc. These are replaced with `[REDACTED]` before the log line is ever written.

HTTP request logging is done via `pino-http` which:
- Generates a `reqId` per request from the `X-Request-ID` header (or a UUID if absent)
- Auto-logs every request/response pair with method, URL, status, and latency
- Silences health-check endpoints (`/health/live`, `/health/ready`, `/health/startup`) in production to reduce noise

Correlation IDs (from `correlationMiddleware`) are stored in `AsyncLocalStorage` via `requestIdPropagationMiddleware` so every log line emitted downstream carries the same `requestId`.

### Pillar 2 — Distributed Tracing (OpenTelemetry)

**OpenTelemetry SDK** (`@opentelemetry/sdk-node`) is initialised in `apps/api/src/tracing.ts` before any other module. It provides auto-instrumentation for:

- Express routes (span per request)
- MongoDB queries (span per query via `@opentelemetry/instrumentation-mongodb`)
- Outbound HTTP calls (`@opentelemetry/instrumentation-http`)
- File system calls disabled (`@opentelemetry/instrumentation-fs`) — too noisy

Span processor selection:
- **OTLP endpoint configured** (`OTEL_EXPORTER_OTLP_ENDPOINT`): `BatchSpanProcessor` → OTLP exporter (sends to Jaeger/Tempo/Datadog)
- **Development without OTLP**: `SimpleSpanProcessor` → `ConsoleSpanExporter`
- **Production without OTLP**: no-op (tracing disabled gracefully)

Sampling:
- **Development**: 100 % of traces sampled
- **Production default**: 10 % head-based sampling (configurable via `OTEL_SAMPLING_RATE`)
- **Sentry**: independently samples at 20 % in production for performance profiling

The `traceparent` and `x-request-id` headers are propagated to span attributes, enabling trace correlation with logs.

### Pillar 3 — Metrics (Prometheus / prom-client)

`prom-client` exposes a `/metrics` endpoint scraped by Prometheus. Key metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Requests by method, route, status |
| `http_request_duration_seconds` | Histogram | Latency distribution |
| `mongodb_connection_pool_size` | Gauge | Active DB connections |
| `mongodb_pool_wait_queue_size` | Gauge | Queued connection requests |
| `security_header_violations_total` | Counter | CSP / header violation events |
| `cache_hit_rate` | Gauge (logged) | Cache effectiveness (logged, not exported) |

`metricsMiddleware` is registered before all API routes so every request is instrumented.

Prometheus alert rules are defined in `apps/api/prometheus-alerts.yml`:
- Error rate > 1 % over 5 min
- p95 latency > 2000 ms
- MongoDB pool utilisation > 95 %

Grafana dashboards consume the Prometheus data. A docker-compose `monitoring` profile starts Prometheus + Grafana locally.

### Pillar 4 — Error Tracking (Sentry)

**Sentry** (`@sentry/node` ^8 + `@sentry/profiling-node`) is initialised in `apps/api/src/instrument.ts` as the very first import.

Key configuration:
- `tracesSampleRate: 0.2` in production (20 % of transactions profiled)
- `beforeSend` hook runs `scrubPHI()` — strips `firstName`, `lastName`, `dateOfBirth`, `patientId`, `mrn`, `ssn`, `email`, `phone`, `address` from event payloads before they leave the process
- Only 5xx (unexpected) errors are sent to Sentry; 4xx errors are client errors and are not reported
- Alert thresholds configured in the Sentry dashboard: error rate > 1 %, p95 latency > 2000 ms

### Backup metrics

`initializeBackupMetrics()` loads the last backup status into Prometheus gauges on startup, enabling alerting if a backup has not run within the expected window.

## Consequences

### Positive

- Pino redaction guarantees PHI never appears in log output, regardless of developer discipline.
- `AsyncLocalStorage` correlation means every log line from a request — including database calls — carries the same `requestId`.
- OpenTelemetry's vendor-neutral OTLP export means the backend (Jaeger, Grafana Tempo, Datadog) can be changed without code changes.
- Sentry's `beforeSend` hook is the last line of defence for PHI scrubbing before data leaves the process.

### Negative / Trade-offs

- 10 % trace sampling in production means 90 % of requests are not traced; rare slow requests may not be captured.
- Pino redaction is path-based — a new PHI field added to a response object without a matching redaction path would not be censored. Code review must enforce adding new PHI paths to the redaction list.
- Running Prometheus, Grafana, ELK, and Sentry adds significant infrastructure complexity.

### Neutral

- The ELK stack docker-compose profile is optional in development; stdout JSON is sufficient for most debugging.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Winston instead of Pino | Pino is 3–5× faster and has better JSON serialisation; Winston's plugin ecosystem is not needed |
| Datadog agent instead of OpenTelemetry | Vendor lock-in; OTLP is vendor-neutral |
| AWS CloudWatch instead of Prometheus/Grafana | Adds cloud vendor dependency; Prometheus is self-hosted and cloud-agnostic |
| Rollbar instead of Sentry | Sentry has a better PHI scrubbing API (`beforeSend`) and Node.js profiling integration |

## References

- `apps/api/src/utils/logger.ts` — Pino configuration
- `apps/api/src/tracing.ts` — OpenTelemetry SDK initialisation
- `apps/api/src/instrument.ts` — Sentry + PHI scrubbing
- `apps/api/src/services/metrics.service.ts` — prom-client metrics
- `apps/api/src/middlewares/metrics.middleware.ts` — HTTP metrics middleware
- `apps/api/prometheus-alerts.yml` — Prometheus alert rules
- `.sentry/alerts.yml` — Sentry alert configuration
