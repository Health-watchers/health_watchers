# API Performance Benchmarking

Automated benchmarking for the Health Watchers API (issue #1319).

```
k6 scenarios  ─┐
resources     ─┼─▶  results/  ─▶  report + recommendations  ─▶  history/
baselines     ─┘
```

## What runs

| Piece | File | Purpose |
|---|---|---|
| Benchmark suite | `benchmarks/api-benchmarks.js` | One isolated k6 scenario per critical endpoint (health, login, patients list/search, appointments, payments, clinics) with p50/p90/p95/p99, throughput, error-rate |
| Baselines | `baselines/baselines.json` | p95 budget per endpoint + regression threshold % (single source of truth for gates) |
| Resource capture | `scripts/capture-resources.js` | Samples API CPU/memory during the run |
| History | `scripts/record-history.js` → `history/metrics-history.json` | Appends each run for trend tracking (persisted via the CI actions cache) |
| Recommendations | `scripts/recommendations.js` | Actionable, endpoint-specific improvement suggestions (indexes, caching, pooling, autoscaling…) |
| Report/dashboard | `scripts/generate-report.js` | `reports/performance-report.md`, `performance-report.json`, `performance-dashboard.html` + the CI **regression gate** |

## Running locally

```bash
# start the API (docker compose or npm run dev --workspace=api), then:
k6 run performance/benchmarks/api-benchmarks.js \
  --env BASE_URL=http://localhost:3001 \
  --env AUTH_TOKEN=<jwt> \
  --env PERF_EMAIL=doctor@example.com \
  --env PERF_PASSWORD='Password123!' \
  --summary-export=performance/results/summary.json

# in parallel: capture resource utilization
node performance/scripts/capture-resources.js --duration 45 --interval 3 &

# post-process
node performance/scripts/record-history.js --branch local --commit $(git rev-parse --short HEAD)
node performance/scripts/recommendations.js
node performance/scripts/generate-report.js   # exit 1 on regression
open performance/reports/performance-dashboard.html
```

`PERF_MODE=light` (default) keeps runs short; `PERF_MODE=full` gives a longer steady state for nightly runs.

## CI

`.github/workflows/performance-benchmarks.yml` runs the full pipeline:

- **every PR** (light mode) — regression gate posts a report comment and fails the job if any endpoint exceeds `baseline × (1 + regression_threshold_percent)`
- **push to main/develop** and **nightly** (full mode) — same gate, plus historical trend accumulation
- artifacts (`performance-report`) retained for 30 days; failures notify Slack

## Maintenance procedures

- **Adding an endpoint:** add it to `ENDPOINTS` in `benchmarks/api-benchmarks.js`, add a `<key>_duration` baseline in `baselines/baselines.json`. The gate, report and recommendations pick it up automatically.
- **Tuning budgets:** change `<key>_duration` (p95 in ms) or `regression_threshold_percent` in `baselines/baselines.json`. Prefer raising budgets only with evidence (e.g. noisy shared runners), and re-baseline afterwards.
- **Reading recommendations:** `reports/recommendations.md` — every suggestion maps to an action you can take (index, cache, pool, scale). Never delete a regressing endpoint from the suite to silence it; investigate first.
- **History growth:** `HISTORY_MAX` (default 60 runs) trims `history/metrics-history.json` automatically.
