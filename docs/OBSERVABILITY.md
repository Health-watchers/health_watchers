# Logging & Tracing Guide

How Health Watchers logs, correlates, and traces requests across the API, and the conventions to follow when adding new log statements or spans. This is the reference for [issue #1282](https://github.com/Health-watchers/health_watchers/issues/1282).

---

## Table of Contents

- [Overview](#overview)
- [Structured Logging](#structured-logging)
- [Log Levels](#log-levels)
- [Sensitive Data Redaction](#sensitive-data-redaction)
- [Correlation IDs](#correlation-ids)
- [Distributed Tracing](#distributed-tracing)
- [Metrics](#metrics)
- [Log Aggregation](#log-aggregation)
- [Best Practices](#best-practices)

---

## Overview

The API (`apps/api`) uses [Pino](https://getpino.io/) for structured logging and [OpenTelemetry](https://opentelemetry.io/) for distributed tracing. Both are initialised before any other module so every downstream import benefits from them:

```ts
// apps/api/src/app.ts
import './tracing';   // OpenTelemetry SDK — must be first
import './instrument'; // Sentry — must be first
import './config/env'; // env validation — must be second
```

| Concern | Tool | Entry point |
|---|---|---|
| Application logs | Pino | `src/utils/logger.ts` |
| HTTP request logs | `pino-http` | `src/middlewares/correlation.middleware.ts` |
| Request correlation | custom middleware + AsyncLocalStorage | `src/middlewares/correlation.middleware.ts`, `src/utils/request-id.ts` |
| Distributed tracing | OpenTelemetry SDK | `src/tracing.ts`, `src/utils/tracer.ts` |
| Trace ID on responses | custom middleware | `src/middlewares/trace-id.middleware.ts` |
| Error monitoring | Sentry | `src/instrument.ts` |
| Metrics | `prom-client` | `src/middlewares/metrics.middleware.ts` |
| Log aggregation | ELK stack | `logging/README.md` |
| Metrics dashboards & alerting | Prometheus/Grafana | `monitoring/README.md` |

## Structured Logging

The shared logger (`src/utils/logger.ts`) is a single Pino instance imported wherever the API logs something:

```ts
import logger from '../utils/logger';

logger.info({ event: 'patient:created', patientId }, 'Patient record created');
```

- **Always pass a structured payload as the first argument** (an object) and a short human-readable message as the second. The object's fields become searchable JSON fields in production; the message stays constant so log lines with the same shape are easy to group and alert on.
- In development, logs are pretty-printed and colorized via `pino-pretty`. In production (`NODE_ENV=production`), logs are emitted as single-line JSON, which the ELK pipeline (`logging/README.md`) parses directly — don't add custom `console.log` formatting that would break that parsing.
- HTTP request/response logging is handled automatically by `pino-http` (mounted in `app.ts`); you don't need to log "request received" manually in route handlers.

**Use the shared `logger`, not `console.*`.** A handful of files (validators, migrations, seed scripts) still call `console.log`/`console.error` directly — these bypass structured formatting, redaction, and log-level filtering, and won't show up correctly in Kibana. When touching one of these files, switch it to `logger`.

## Log Levels

Level is controlled by the `LOG_LEVEL` environment variable (see `.env.example`), read once at process start:

```ts
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', ... });
```

| Level | When to use |
|---|---|
| `fatal` | The process is about to crash / exit |
| `error` | An operation failed and needs investigation (caught exceptions, failed external calls) |
| `warn` | Something unexpected but recoverable (retrying, falling back, approaching a limit — e.g. connection-pool utilization, rate-limit hits) |
| `info` | Normal but noteworthy lifecycle events (server started, DB connected, a resource was created) |
| `debug` | Verbose detail useful only when actively debugging a specific area |
| `trace` | Extremely verbose, per-iteration detail — rarely enabled |

Set `LOG_LEVEL=debug` locally when you need more detail; keep it at `info` (or `warn` in high-traffic environments) in staging/production to control log volume and ingestion cost. Levels below the configured threshold are skipped at zero cost — prefer adding a `logger.debug(...)` call over temporarily uncommenting a `console.log`.

## Sensitive Data Redaction

PHI and credentials must never reach log storage or Sentry. Two independent layers enforce this:

1. **Pino `redact` config** (`src/utils/logger.ts`) — replaces known-sensitive paths with `[REDACTED]` before serialization: `req.headers.authorization`, `req.headers.cookie`, `body.password`, `body.token`, `body.refreshToken`, `body.cardNumber`, `body.cvv`, etc.
2. **Sentry `beforeSend` scrubbing** (`src/instrument.ts`) — strips PHI keys (name, DOB, phone, email, `patientId`, `mrn`, `ssn`, insurance ID) from error events before they leave the process.

There's also a standalone `src/utils/redact.ts` helper for redacting values inline (e.g. before logging a computed object that isn't a raw `req`/`res`).

**When adding a new field that can carry PHI or a secret** (a new request body field, a new model field), add its path to the `redact.paths` array in `src/utils/logger.ts` rather than relying on callers to remember not to log it. Never log a full `patient`, `user`, or `req.body` object without first checking whether it contains PHI — log specific, known-safe fields (`patientId`, `clinicId`, `action`) instead.

## Correlation IDs

Every request gets a correlation ID so a single request can be traced across logs, error reports, and traces:

1. `pino-http` (`correlation.middleware.ts`) generates a UUID v4 per request, or reuses an incoming `X-Request-ID` header if one was sent by an upstream caller (the web app or `stellar-service`).
2. `correlationMiddleware` stamps it onto `req.requestId` and echoes it back as the `X-Request-ID` response header.
3. `requestIdPropagationMiddleware` (`src/utils/request-id.ts`) stores it in an `AsyncLocalStorage`, so code that doesn't have direct access to `req` (a service, a background job triggered by the request) can still read the current request's ID via `getRequestId()`.

```ts
import { getRequestId } from '../utils/request-id';

logger.error({ requestId: getRequestId(), err }, 'Payment settlement failed');
```

Audit log entries (`auditlogs` collection) also store `requestId`, so a single correlation ID lets you join an audit trail entry, an application log line, and a distributed trace for the same request.

## Distributed Tracing

OpenTelemetry auto-instruments Express, MongoDB, and outbound HTTP calls (`src/tracing.ts`), so most spans require no manual code. Traces are exported via OTLP to `OTEL_EXPORTER_OTLP_ENDPOINT` when set (e.g. an OpenTelemetry Collector or Jaeger); in development with no endpoint configured, spans print to the console instead.

**Trace sampling** is controlled by `OTEL_SAMPLING_RATE` (0.0–1.0, default `1.0` in development and `0.1` in production) — a head-based probability sampler decides per-trace whether to record it. Lower this in high-traffic environments to control exporter/storage volume; raise it temporarily while investigating an incident.

**`X-Trace-Id` response header** — `trace-id.middleware.ts` reads the active span's trace ID and adds it as a response header, so a client (or a support engineer with access to a failed request/response pair) can jump straight to the matching trace in your tracing backend without needing log access.

**Manual spans** — for a specific operation you want to see broken out in a trace (e.g. a slow external call or a multi-step business operation), wrap it with `withSpan` (`src/utils/tracer.ts`) rather than calling the OTel API directly:

```ts
import { withSpan } from '../utils/tracer';

const result = await withSpan('stellar:submit-payment', { patientId, amount }, async (span) => {
  const tx = await stellarClient.submit(payment);
  span.setAttribute('stellar.txHash', tx.hash);
  return tx;
});
```

`withSpan` automatically records exceptions and sets the span status, so you don't need a manual try/catch just to mark the span as failed.

**Performance metrics on traces** — span attributes (`span.setAttribute`) are the way to attach numeric/contextual detail (row counts, retry counts, external latency) to a specific operation; use `prom-client` metrics (below) for aggregate, dashboard-friendly numbers instead of trying to derive them from traces after the fact.

## Metrics

`prom-client`-based HTTP metrics are collected by `metrics.middleware.ts` and exposed at `/metrics` (mounted before the versioned API routers, so all requests are measured). See `monitoring/README.md` for the Prometheus/Grafana setup and `monitoring/runbooks/` for the alerts built on top of these metrics (e.g. `MONGODB_POOL_WAIT_QUEUE.md`, `HIGH_ERROR_RATE.md`, `API_DOWN.md`).

## Log Aggregation

Centralized log storage and search runs on the ELK stack (Elasticsearch/Logstash/Kibana); see `logging/README.md` for the stack setup, index patterns, and how JSON logs emitted by Pino in production flow into it. This document covers what to log and how — `logging/README.md` covers where it ends up and how to search it.

## Best Practices

- Use the shared `logger` (`src/utils/logger.ts`) everywhere — never a second logger instance, never bare `console.*` in new code.
- Log structured fields, not string-interpolated messages: `logger.info({ patientId, action }, 'Patient updated')`, not `` logger.info(`Patient ${patientId} updated`) ``.
- Never log PHI, credentials, or full request/response bodies — extend `redact.paths` for new sensitive fields instead of trusting call sites to remember.
- Prefer `warn`/`error` for anything that should page or alert someone; reserve `info` for lifecycle events and `debug` for local troubleshooting detail.
- Include `requestId` (via `getRequestId()`) on logs emitted outside of an Express request handler (background jobs, queue consumers) so they can still be correlated back to the triggering request.
- For a new operation worth seeing as its own span in a trace, use `withSpan` rather than reaching for the OpenTelemetry API directly.
- Don't add a new logging library, transport, or tracing SDK — extend the existing Pino/OpenTelemetry setup.

## Observability Best Practices

The sections above cover *how* logging, tracing and metrics are wired. This section is the *how to use it well* reference.

- [The three pillars, and when to reach for each](#pillars)
- [Metrics](#metrics)
- [Logs](#logs)
- [Traces](#traces)
- [Dashboards](#dashboards)
- [Alerting](#alerting)
- [SLOs and error budgets](#slos)
- [On-call and incident response](#oncall)
- [Performance profiling](#profiling)
- [Checklist for a new feature](#checklist)

<a name="pillars"></a>
### The three pillars, and when to reach for each

| Question | Pillar |
|----------|--------|
| "Is something wrong, and how bad?" | **Metrics** (cheap, always-on, alertable) |
| "Which request / user / record?" | **Logs** (structured, correlated by `requestId`) |
| "Where in the call graph is the time / error going?" | **Traces** (per-request spans across API → Mongo → Stellar) |

Start at metrics (dashboard / alert), pivot to traces for a slow or failing
request, then to logs for the exact payload. Every layer shares the
`requestId` / `traceparent` correlation id.

<a name="metrics"></a>
### Metrics

- **Never instantiate a `Counter`/`Gauge`/`Histogram` inline.** Add it to
  `apps/api/src/services/metrics.service.ts` (HTTP/infra) or
  `apps/api/src/monitoring/custom-metrics.ts` (domain), export a `record*`
  helper, and call the helper. This keeps registration single-sourced and
  prevents "metric already registered" crashes.
- **Name by convention:** `<subsystem>_<thing>_<unit>[_total]`. Counters end in
  `_total`. Seconds, not milliseconds. Bytes, not KB.
- **Keep label cardinality bounded.** Labels are enum-like: `channel`,
  `status`, `event`. Never label with a user id, clinic id, email, path
  parameter or free text — that is a log field, not a metric label.
- **Prefer a helper that encodes intent:** `recordNotificationDelivery(channel,
  status)` beats a raw `.inc({channel, status})` at the call site.
- **Expose derived views as recording rules** (`monitoring/recording-rules.yml`)
  so dashboards and alerts agree on the same expression.

<a name="logs"></a>
### Logs

- Use the shared `logger` (`@api/utils/logger`, Pino). Never `console.*` — it is
  an ESLint error in `apps/api`.
- **Structured first:** `logger.warn({ deliveryId, channel, attempts }, 'msg')`,
  not string interpolation. The object is queryable in Kibana; the message is
  the human label.
- **Log levels:** `error` = we lost work / need a human; `warn` = degraded but
  handled (retry scheduled, provider unconfigured); `info` = state transitions
  worth keeping; `debug` = development only.
- **One log line per outcome**, at the boundary. Don't log the same failure at
  every layer as it bubbles up.
- **Never log PHI or secrets.** The logger redacts common fields
  (`authorization`, `password`, `token`, …); still pass ids, not bodies.
- Always include the correlation id — middleware puts `requestId` on the child
  logger automatically; in jobs/workers add it yourself.

<a name="traces"></a>
### Traces

- Auto-instrumentation covers Express, HTTP clients and MongoDB. Add a manual
  span only around meaningful non-instrumented work (a crypto batch, a template
  render loop, a provider SDK call): `tracer.startActiveSpan('telehealth.recording.start', …)`.
- Name spans `<area>.<operation>`; put identifiers on span **attributes**, not
  the name.
- Set span status to `ERROR` and record the exception on the span you own —
  don't just rethrow.
- Sampling is head-based (`OTEL_SAMPLING_RATE`, 10% in prod). For a specific
  investigation, raise it temporarily or force-sample by trace context; don't
  ship 100% sampling.

<a name="dashboards"></a>
### Dashboards

- Every subsystem gets **one** dashboard that answers "is it healthy?" in the
  first row: rate, errors, duration (RED), then saturation, then business KPIs.
- Panels reference **recording rules**, not ad-hoc `histogram_quantile(...)`.
- New dashboards live in `monitoring/grafana/dashboards/` and are provisioned
  automatically. Tag them and set a stable `uid` so alert `dashboard:` labels
  resolve.
- The notification + telehealth subsystems: `hw-notifications-telehealth`
  (`monitoring/grafana/dashboards/notifications-telehealth.json`).

<a name="alerting"></a>
### Alerting

- **Alert on symptoms, not causes.** "Error budget burning" / "p99 over SLO" /
  "no backup in 26h" — not "CPU high".
- Every alert has: `severity` (critical | warning | info), `team`, a `summary`
  (what) + `description` (impact + first action), and a `runbook_url` for
  anything paging.
- **Critical = wake someone up now.** If it can wait until morning it is
  `warning` (email/Slack). `info` is swallowed by AlertManager by design —
  use it for dashboards, not pages.
- Use `for:` to ride out blips. Use multi-window burn-rate (fast + slow) for
  SLO alerts so you page on real budget loss, not a 30-second spike.
- Rule files are registered in `monitoring/prometheus.yml`. Validate before
  merging: `promtool check rules monitoring/*.yml`.

<a name="slos"></a>
### SLOs and error budgets

- API availability SLO: **99%** of requests non-5xx over 30 days
  (`slo:http_availability:ratio_30d`). Latency SLO: **p99 < 1.5s**
  (`job:http_request_duration:p99_5m`).
- Alerts: `APIErrorBudgetFastBurn` (14.4x, ~2 days to exhaustion → page) and
  `APIErrorBudgetSlowBurn` (6x → ticket).
- When the budget is spent: freeze risky deploys, prioritise reliability work
  until it recovers.

<a name="oncall"></a>
### On-call and incident response

- Rotation is code: `monitoring/oncall/rotation.yaml` (weekly, Monday 10:00 UTC
  hand-off, primary + secondary from the same pool offset so they're never the
  same person). Escalation ladder: `monitoring/oncall/escalation.yaml`.
- A firing critical alert can call
  `scripts/observability/incident-response.sh --alert <name>` (AlertManager
  webhook or by hand). It opens `docs/incidents/<id>/`, snapshots pods / signals
  / error logs, seeds the incident doc from
  `docs/templates/INCIDENT_COMMUNICATION.md`, and posts the "investigating"
  update to Slack.
- Roles: **Commander** (owns the incident, comms), **Ops** (hands on keyboard),
  **Scribe** (timeline). One person may hold two on a small incident.
- Every Sev-1/Sev-2 gets a blameless post-mortem within 3 working days;
  action items become tracked issues.

<a name="profiling"></a>
### Performance profiling

- `scripts/observability/capture-profile.sh --mode local --seconds 20` attaches
  to a local `node --inspect` process and writes a `.cpuprofile` + heap
  snapshot (open in Chrome DevTools → Performance / Memory).
- `--mode pod --pod <name>` profiles a running pod. It signals PID 1 with
  `SIGUSR2`; the API only produces a profile if it registers that handler
  (optional, guarded by `ENABLE_PROFILING_SIGNAL=true`) — otherwise use an
  ephemeral debug container with `--inspect`.
- Profile when a latency dashboard or `EventLoopLagHigh` points at CPU; profile
  heap when `NodeHeapNearLimit` fires or RSS climbs monotonically.

<a name="checklist"></a>
### Checklist for a new feature / subsystem

- [ ] Domain metrics added via `custom-metrics.ts` + `record*` helpers (bounded labels)
- [ ] State transitions logged once, structured, with `requestId`
- [ ] Manual spans around any non-instrumented expensive work
- [ ] Recording rules for any expression a dashboard/alert needs
- [ ] A dashboard (or a row on an existing one) with RED up top, `uid` set
- [ ] Symptom-based alerts with `severity`, `team`, `summary`, `description`, `runbook_url`
- [ ] Rule file added to `monitoring/prometheus.yml`; `promtool check rules` passes
- [ ] Runbook for anything that pages
