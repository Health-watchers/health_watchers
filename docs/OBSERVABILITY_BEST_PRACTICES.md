# Observability Best Practices

Operational companion to [`OBSERVABILITY.md`](./OBSERVABILITY.md) (which covers
*how* logging/tracing/metrics are wired). This guide is the *how to use it well*
reference for [issue #1257](https://github.com/Health-watchers/health_watchers/issues/1257).

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
## The three pillars, and when to reach for each

| Question | Pillar |
|----------|--------|
| "Is something wrong, and how bad?" | **Metrics** (cheap, always-on, alertable) |
| "Which request / user / record?" | **Logs** (structured, correlated by `requestId`) |
| "Where in the call graph is the time / error going?" | **Traces** (per-request spans across API → Mongo → Stellar) |

Start at metrics (dashboard / alert), pivot to traces for a slow or failing
request, then to logs for the exact payload. Every layer shares the
`requestId` / `traceparent` correlation id.

<a name="metrics"></a>
## Metrics

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
## Logs

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
## Traces

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
## Dashboards

- Every subsystem gets **one** dashboard that answers "is it healthy?" in the
  first row: rate, errors, duration (RED), then saturation, then business KPIs.
- Panels reference **recording rules**, not ad-hoc `histogram_quantile(...)`.
- New dashboards live in `monitoring/grafana/dashboards/` and are provisioned
  automatically. Tag them and set a stable `uid` so alert `dashboard:` labels
  resolve.
- The notification + telehealth subsystems: `hw-notifications-telehealth`
  (`monitoring/grafana/dashboards/notifications-telehealth.json`).

<a name="alerting"></a>
## Alerting

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
## SLOs and error budgets

- API availability SLO: **99%** of requests non-5xx over 30 days
  (`slo:http_availability:ratio_30d`). Latency SLO: **p99 < 1.5s**
  (`job:http_request_duration:p99_5m`).
- Alerts: `APIErrorBudgetFastBurn` (14.4x, ~2 days to exhaustion → page) and
  `APIErrorBudgetSlowBurn` (6x → ticket).
- When the budget is spent: freeze risky deploys, prioritise reliability work
  until it recovers.

<a name="oncall"></a>
## On-call and incident response

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
## Performance profiling

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
## Checklist for a new feature / subsystem

- [ ] Domain metrics added via `custom-metrics.ts` + `record*` helpers (bounded labels)
- [ ] State transitions logged once, structured, with `requestId`
- [ ] Manual spans around any non-instrumented expensive work
- [ ] Recording rules for any expression a dashboard/alert needs
- [ ] A dashboard (or a row on an existing one) with RED up top, `uid` set
- [ ] Symptom-based alerts with `severity`, `team`, `summary`, `description`, `runbook_url`
- [ ] Rule file added to `monitoring/prometheus.yml`; `promtool check rules` passes
- [ ] Runbook for anything that pages
