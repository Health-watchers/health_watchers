# Application Monitoring & Alerting

Adds application-wide monitoring and alerting on top of the existing
observability stack (`docker-compose.monitoring.yml`,
`apps/api/prometheus-alerts.yml`, `scripts/observability/`).

## What was added

- **`apps/api/src/monitoring/apm.ts`** — APM bootstrap exposing
  `http_requests_total` and `http_request_duration_seconds` metrics via a
  framework-agnostic middleware, plus a `deployment_verification_checks_total`
  counter used by the deploy verification script below.
- **`apps/api/monitoring/app-alerts.yml`** — application-wide Prometheus
  alert rules:
  - `HighErrorRate` / `ElevatedErrorRate` — 5xx rate thresholds (critical at
    2%, warning at 0.5%).
  - `HighLatencyP99` / `HighLatencyP95` — latency thresholds derived from
    the request duration histogram.
  - `ServiceDown` / `HealthCheckFailing` — uptime and synthetic health
    check alerts, both configured with `for: 1m` so on-call is paged within
    the 1-minute detection target, labeled `page: oncall`.
- **`scripts/deploy-health-check.sh`** — post-deploy verification: polls
  the health endpoint and live error-rate metric for a configurable
  window after each deploy, and automatically rolls back
  (`kubectl rollout undo`) if the service fails health checks 3 times in a
  row or the error rate crosses a critical threshold. Emits an incident
  event via the existing `scripts/observability/incident-response.sh` on
  rollback.

## How it fits together

1. `apm.ts` emits metrics from every request.
2. `app-alerts.yml` evaluates those metrics and fires Prometheus alerts
   (existing Alertmanager routing forwards `page: oncall` alerts to the
   on-call rotation).
3. `deploy-health-check.sh` runs as the last step of the deploy pipeline,
   using the same metrics to decide whether to keep or roll back a release.

## Acceptance criteria mapping

| Criterion | Where |
|---|---|
| Issues detected within 1 minute | `for: 1m` on `ServiceDown`/`HealthCheckFailing` in `app-alerts.yml` |
| Automatic alerts to on-call engineer | `page: oncall` label routed via existing Alertmanager config |
| Deployment health verified | `scripts/deploy-health-check.sh` |
| False alerts minimized | Two-tier thresholds (warning vs. critical) with `for:` durations to avoid single-sample noise |
