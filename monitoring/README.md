# Health Watchers — Monitoring

This directory contains the full observability stack configuration for Health Watchers: Prometheus scrape config, alerting rules, and Grafana dashboard provisioning.

## Stack

| Service    | Port  | Purpose                          |
|------------|-------|----------------------------------|
| Prometheus | 9090  | Metrics collection & alerting    |
| Grafana    | 3003  | Dashboards & visualisation       |
| Jaeger     | 16686 | Distributed tracing (OTLP)       |

Start the full stack with:

```bash
docker compose up -d prometheus grafana jaeger
```

Grafana is available at **http://localhost:3003** (default credentials: `admin` / `admin`).

---

## Dashboards

All dashboards are provisioned automatically from `grafana/provisioning/dashboards/`. No manual import is required. They appear in the **Health Watchers** folder inside Grafana.

### 1. API Performance (`api-performance.json`)

**UID:** `hw-api-performance`

Covers the Express API service (`health-watchers-api`).

| Panel | Metric(s) |
|---|---|
| Request Rate (req/s) | `http_requests_total` by method |
| Error Rate (%) | 4xx and 5xx ratios |
| Throughput by Status | 2xx / 4xx / 5xx breakdown |
| Latency Percentiles (p50/p95/p99) | `http_request_duration_seconds` histogram |
| Latency by Endpoint (p95 top 10) | per-path histogram |
| Request Rate by Endpoint (top 10) | per-path counter |
| Request / Response Size (p95) | `http_request_size_bytes`, `http_response_size_bytes` |
| Node.js Heap Used | `nodejs_heap_size_used_bytes` |
| Event Loop Lag | `nodejs_eventloop_lag_seconds` |
| Active Handles / Requests | `nodejs_active_handles_total` |
| GC Duration (p99) | `nodejs_gc_duration_seconds` |
| CPU Usage | `process_cpu_seconds_total` |

**Alerting rules:** `alerts-business.yml` → `api-health` group  
Alerts: `APIDown`, `HighErrorRate`, `HighP99Latency`

---

### 2. MongoDB Performance (`mongodb-performance.json`)

**UID:** `hw-mongodb`

Covers MongoDB connection pool health as observed from the API process.

| Panel | Metric(s) |
|---|---|
| Connection Pool Size | `mongodb_connection_pool_size` |
| Wait Queue Size | `mongodb_pool_wait_queue_size` |
| Pool Utilization (%) | derived from pool size / max (10) |
| Keypair Decryption Failures | `mongodb_keypair_decryption_failures_total` |
| Connection Pool Over Time | pool size + wait queue trend |
| DB-Bound Request Rate | write vs read HTTP requests |
| API Latency vs DB Pool Pressure | p99 latency correlated with wait queue |
| Node.js Heap | `nodejs_heap_size_used_bytes` |
| Payment Expiration Job Health | consecutive failures + expired count |

**Alerting rules:** `alerts-business.yml` → `mongodb-health` group  
Alerts: `MongoDBPoolHighUtilization`, `MongoDBPoolWaitQueueNonEmpty`

> **Note:** The pool max is hardcoded as `10` in the utilisation gauge expression. Update this if you change the Mongoose `maxPoolSize` option.

---

### 3. Stellar Payments (`stellar-payments.json`)

**UID:** `hw-stellar-payments`

Covers the Stellar payment service and payment lifecycle metrics.

| Panel | Metric(s) |
|---|---|
| Payment Success Rate (%) | `payments_confirmed_total` / `payments_initiated_total` |
| Payments Initiated / Confirmed | cumulative counters |
| Stellar Service Uptime | `up{job="health-watchers-stellar"}` |
| Payment Rate Over Time | by currency |
| Stellar Transactions by Type & Status | `stellar_transactions_total` |
| Stellar Service Latency (p50/p95/p99) | `http_request_duration_seconds` |
| Stellar Service Error Rate | 5xx ratio |
| Payment Expiration Job — Last Success | time since last successful run |
| Payment Expiration Job — Consecutive Failures | `payment_expiration_job_consecutive_failures` |
| Payments Expired (last run) | `payment_expiration_job_last_run_expired` |

**Alerting rules:** `alerts-payments.yml`  
Alerts: `StellarServiceDown`, `PaymentSuccessRateLow`, `StellarServiceHighErrorRate`, `StellarServiceHighLatency`, `PaymentExpirationJobStalled`, `PaymentExpirationJobConsecutiveFailures`, `PaymentExpirationJobErrorRateHigh`

---

### 4. Business KPIs (`business-kpis.json`)

**UID:** `hw-business-kpis`

Covers product-level health and growth metrics. Default time range is 24 hours.

| Panel | Metric(s) |
|---|---|
| Total Patients Created | `patients_created_total` |
| Total Encounters Created | `encounters_created_total` |
| Total Payments Confirmed | `payments_confirmed_total` |
| Total AI Requests | `ai_requests_total` |
| Patient Creation Rate | by `clinicId` |
| Encounter Creation Rate | by `clinicId` |
| Business Activity Trend | all counters as rates |
| AI Requests by Endpoint | `ai_requests_total` by `endpoint` |
| Payments by Currency | initiated vs confirmed by `currency` |
| Top Clinics by Patient Volume | bar gauge |
| Top Clinics by Encounter Volume | bar gauge |
| Subscription Limit Violations | `subscription_limit_violations_total` by tier/resource |
| Payment Expiration Job — Payments Expired | `payment_expiration_job_last_run_expired` |

**Alerting rules:** `alerts-business.yml` → `business-kpis` group  
Alerts: `PatientCreationRateZero`, `EncounterCreationRateZero`, `AIRequestRateZero`, `HighSubscriptionLimitViolations`

---

### 5. Security (`security.json`)

**UID:** `hw-security`

Covers authentication failures, rate limit violations, and security-sensitive events.

| Panel | Metric(s) |
|---|---|
| Auth Failures (401) Rate | `http_requests_total{status="401"}` |
| Forbidden (403) Rate | `http_requests_total{status="403"}` |
| Rate Limit Violations (429) Rate | `http_requests_total{status="429"}` |
| Keypair Decryption Failures | `mongodb_keypair_decryption_failures_total` |
| Auth Failures Over Time (401/403) | per-path breakdown |
| Rate Limit Violations Over Time | per-path breakdown |
| Auth Endpoint Traffic | `/auth/*` paths by status |
| Subscription Limit Violations by Tier | `subscription_limit_violations_total` |
| Keypair Decryption Failures Over Time | trend |
| 5xx Error Rate by Endpoint | top 10 failing paths |
| Audit Log Volume | derived from total request rate |
| Security Event Summary (1h) | table of all security event counts |

**Alerting rules:** `alerts-security.yml`  
Alerts: `HighAuthFailureRate`, `HighForbiddenRate`, `HighRateLimitViolationRate`, `StellarKeypairDecryptionFailure`, `SubscriptionLimitViolationSpike`

---

## Alert Rules

Alert rules are split across four files, all loaded by Prometheus:

| File | Groups | Description |
|---|---|---|
| `alerts.yml` | `health-watchers-alerts` | Legacy combined alerts (kept for backward compatibility) |
| `alerts-payments.yml` | `payment-expiration-job`, `stellar-payments` | Payment lifecycle and Stellar service alerts |
| `alerts-security.yml` | `security` | Auth failures, rate limits, keypair issues |
| `alerts-business.yml` | `business-kpis`, `api-health`, `mongodb-health` | Business KPIs, API health, MongoDB health |

Each alert includes a `dashboard` label pointing to the relevant Grafana dashboard UID for quick navigation.

### Severity Levels

| Severity | Meaning |
|---|---|
| `critical` | Immediate action required — service is down or data integrity at risk |
| `warning` | Degraded performance or elevated error rates — investigate soon |
| `info` | Informational — no immediate action required |

---

## Metrics Reference

### API Service (`health-watchers-api`)

| Metric | Type | Labels | Description |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `path`, `status` | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | `method`, `path` | Request duration |
| `http_request_size_bytes` | Histogram | `method`, `path` | Request body size |
| `http_response_size_bytes` | Histogram | `method`, `path` | Response body size |
| `patients_created_total` | Counter | `clinicId` | Patients created |
| `encounters_created_total` | Counter | `clinicId` | Encounters created |
| `payments_initiated_total` | Counter | `currency` | Payments initiated |
| `payments_confirmed_total` | Counter | `currency` | Payments confirmed |
| `ai_requests_total` | Counter | `endpoint` | AI endpoint requests |
| `subscription_limit_violations_total` | Counter | `tier`, `resource` | Subscription limit hits |
| `payment_expiration_job_errors_total` | Counter | — | Job execution failures |
| `payment_expiration_job_last_run_expired` | Gauge | — | Payments expired in last run |
| `payment_expiration_job_last_success_timestamp_seconds` | Gauge | — | Unix timestamp of last success |
| `payment_expiration_job_consecutive_failures` | Gauge | — | Consecutive failure count |
| `mongodb_connection_pool_size` | Gauge | — | Active MongoDB connections |
| `mongodb_pool_wait_queue_size` | Gauge | — | Connections waiting for pool slot |
| `mongodb_keypair_decryption_failures_total` | Counter | — | Stellar keypair decryption failures |

### Stellar Service (`health-watchers-stellar`)

| Metric | Type | Labels | Description |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `path`, `status` | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | `method`, `path` | Request duration |
| `stellar_transactions_total` | Counter | `type`, `status` | Stellar transactions processed |
| `stellar_confirmed_payments_total` | Counter | — | Payments auto-confirmed by the Horizon stream |
| `stellar_payment_queue_depth` | Gauge | — | Payments waiting to be processed |
| `stellar_stream_health` | Gauge | — | `1` when the Horizon payment stream is active, `0` when disconnected |

All services also export standard Node.js metrics with the `nodejs_` prefix (heap, GC, event loop lag, etc.) and `process_` metrics.

### Where metrics are exported

Every metric used by the dashboards above is registered in code, so the dashboards never reference a metric that no service emits:

| Service | Source file | Exposed at |
|---|---|---|
| `health-watchers-api` | `apps/api/src/services/metrics.service.ts` (business + infra metrics) and `apps/api/src/middlewares/metrics.middleware.ts` (per-request HTTP metrics) | `GET /metrics` |
| `health-watchers-stellar` | `apps/stellar-service/src/metrics.ts` | `GET /metrics` |

Both `/metrics` endpoints are scraped by Prometheus per `prometheus.yml`. When adding a panel, confirm the metric name exists in one of these files first.

---

## Adding a New Dashboard

1. Create a JSON file in `grafana/provisioning/dashboards/` with a unique `uid`.
2. The dashboard provider reloads every 30 seconds — no Grafana restart needed.
3. Add corresponding alert rules to the appropriate `alerts-*.yml` file.
4. Update this README with the new dashboard's panel and metric inventory.

## Troubleshooting

**Dashboards not appearing in Grafana**  
Check that the JSON is valid and the `uid` is unique across all dashboard files. Grafana logs provisioning errors at startup.

**"No data" on panels**  
Verify the Prometheus scrape targets are healthy at http://localhost:9090/targets. Confirm the API and Stellar service are running and the `METRICS_USERNAME`/`METRICS_PASSWORD` env vars match.

**Alert rules not loading**  
Check Prometheus logs and verify the alert file paths in `prometheus.yml` match the volume mounts in `docker-compose.yml`.
