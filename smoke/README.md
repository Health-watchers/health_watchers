# Smoke Testing Suite

The smoke suite verifies that the Health Watchers platform is up and its
critical paths work, fast. It is the first line of defence between CI and any
deployment: if a core journey breaks, the smoke tests fail before users see it.

## What it covers

| Layer | Check | File |
|---|---|---|
| API | Liveness (`/health/live`) | `api-smoke.js` + `config.json` |
| API | Readiness (`/health/ready`) | `api-smoke.js` + `config.json` |
| API | Authentication login | `api-smoke.js` + `config.json` |
| API | Patients list & search | `api-smoke.js` + `config.json` |
| API | Appointments & payments lists | `api-smoke.js` + `config.json` |
| Web | Login → dashboard | `apps/web/e2e/smoke/critical-flows.spec.ts` |
| Web | Patient list renders from the API | `apps/web/e2e/smoke/critical-flows.spec.ts` |
| Web | Patient search narrows the list | `apps/web/e2e/smoke/critical-flows.spec.ts` |

Web checks run across **chromium, firefox, webkit, mobile-ios, mobile-android**
via `apps/web/playwright.smoke.config.ts`.

## Quick reference

```bash
# API smoke only (assumes API already running on :3001)
RUN_WEB=0 smoke/run-smoke.sh
# or
SMOKE_API_URL=http://localhost:3001 smoke/run-smoke.sh

# API + cross-browser web smoke (requires web app on :3000)
smoke/run-smoke.sh --web

# Point at an environment
SMOKE_API_URL=https://example.com/api SMOKE_WEB_URL=https://example.com smoke/run-smoke.sh --web

# Credentials (fall back to doctor@example.com / Password123!)
SMOKE_DOCTOR_EMAIL=... SMOKE_DOCTOR_PASSWORD=... smoke/run-smoke.sh
```

Outputs land in `smoke/reports/`:

- `api-smoke-results.json` — per-check status, duration, retries
- `web-smoke-results.json` — Playwright results per browser project
- `smoke-report.json` / `smoke-report.md` — aggregated summary
- `smoke-dashboard.html` — human-readable dashboard for artifact review

## Execution time budget

The whole suite must finish within **5 minutes** (default `SMOKE_BUDGET_MS=300000`).
`api-smoke.js`, `run-smoke.sh` and `report.js` all enforce the budget; the CI jobs
also set a hard `timeout-minutes`. If a run exceeds the budget it fails, so we
notice before smoke tests become a bottleneck.

## Retry & flake handling

- API checks retry up to `SMOKE_RETRIES` (default 2) with linear backoff.
  Failures are reported only after retries are exhausted.
- Playwright smoke retries twice in CI and keeps a trace/video on first retry.
- A nightly scheduled run catches flakiness that only appears on cold caches.

## CI

`.github/workflows/smoke-tests.yml` runs the suite on:

- PRs and pushes to `main`/`develop`
- a nightly schedule (catch degradations between deployments)
- manual dispatch

The workflow uploads the dashboard artifact, writes a summary to the job
summary page, and notifies Slack when the suite fails.

## Maintenance procedures

### Adding a new API check
1. Add a check object to `smoke/config.json` under `api.checks`.
2. Use `"authenticated": true` if it needs a logged-in user.
3. Give it a sane `maxDurationMs` so latency regressions surface.
4. Mark `"critical": true` for checks that must block a release; non-critical
   checks warn but never fail the suite.

### Adding a new web flow
1. Add a test to `apps/web/e2e/smoke/critical-flows.spec.ts` (or a new spec in
   `apps/web/e2e/smoke/`).
2. Keep it fast: smoke tests assert *survives*, full suites assert *behaves*.
3. The flow runs automatically in all five browser projects.

### When a smoke test fails
1. Read `smoke/reports/smoke-report.md` / the dashboard artifact.
2. Distinguish *infra* (server down, DB down, timeout) from *regression*
   (status/locator changed). Fix infra; fix regression immediately.
3. If a value is environmentally flaky despite retries, raise `SMOKE_RETRIES`
   or the relevant `maxDurationMs` — never just delete the check.

### Changing the budget
Update `SMOKE_BUDGET_MS` (default in `config.json`, `run-smoke.sh` and the
workflow env) together. Keep it under 5 minutes.

### Running the suite against staging/prod
Start the API + web app (or point the URLs above at the environment), make sure
`SMOKE_DOCTOR_EMAIL`/`SMOKE_DOCTOR_PASSWORD` are set for that environment, and
run `smoke/run-smoke.sh --web`.