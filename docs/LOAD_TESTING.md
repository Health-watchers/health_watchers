# Load Testing

Health Watchers load testing guide using k6.

## Test Scenarios

### Smoke Test

- **Purpose**: Validate environment and basic endpoint health.
- **Load**: 1 VU for 1 minute.
- **Endpoints**: `/health`, `/api/v1/auth/login`, `/api/v1/clinics`

Run:
```bash
k6 run k6/smoke-test.js
```

### Load Test — Scalability (Primary)

- **Purpose**: Measure behavior under expected production load.
- **Load**: Ramp 10 → 50 → 100 VUs over ~10 minutes.
- **Endpoints**:
  - `GET /api/v1/patients?limit=20`
  - `POST /api/v1/patients`
  - `GET /api/v1/encounters?limit=20`
  - `POST /api/v1/encounters`
  - `GET /api/v1/clinics`
- **Thresholds**:
  - `http_req_duration`: p95 < 500ms, p99 < 2000ms
  - `http_req_failed`: rate < 0.01
  - `group_duration{Patient Endpoints}`: p95 < 1000ms
  - `group_duration{Encounter Endpoints}`: p95 < 1500ms
  - `group_duration{Clinic Endpoints}`: p95 < 500ms

Run:
```bash
k6 run k6/load-test-scenarios.js --summary-export=performance/summary.json
```

### Stress Test

- **Purpose**: Find breaking point.
- **Load**: Ramp to 200 VUs over 5 minutes, hold 10 minutes, ramp down.

Run:
```bash
k6 run k6/stress-test.js
```

### Spike Test

- **Purpose**: Verify recovery after sudden traffic spike.
- **Load**: Spike to 500 VUs for 1 minute.

Run:
```bash
k6 run k6/spike-test.js
```

## Results Analysis

Use the built-in analyzer:
```bash
node k6/analyze-results.js performance/summary.json performance/results-template.json
```

### Bottleneck Identification

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| p99 > 2000ms | Slow DB query | Add index, review projection, use read preference |
| Connection time p99 > 200ms | Connection pool exhaustion | Increase pool size, add read replicas |
| Failure rate > 1% | Timeout or 5xx | Check app logs, DB connections, memory limits |
| High `http_req_waiting` | Event-loop saturation | Profile CPU, reduce synchronous work |

## CI Integration

Performance regression tests run on every PR via `.github/workflows/performance.yml`.

Baselines are stored in `performance/baselines/baselines.json`. The baseline is compared against p95 latency for each endpoint with a 20% regression threshold.

### Updating Baselines

Baselines should be updated when:
- Performance improvements are intentionally made
- Infrastructure changes affect baseline performance
- New endpoints are added
- Refactoring changes expected performance characteristics

**Process:**

1. **Run baseline capture against staging:**
   ```bash
   k6 run k6/regression-baseline.js \
     --env BASE_URL=https://api-staging.healthwatchers.com \
     --env AUTH_TOKEN=<staging-jwt> \
     --out json=baseline-results.json
   ```

2. **Extract p95 values:**
   ```bash
   node -e "
     const data = require('./baseline-results.json');
     const baselines = {};
     for (const [key, metric] of Object.entries(data.metrics)) {
       if (key.startsWith('baseline_')) {
         baselines[key] = Math.round(metric.values['p(95)']);
       }
     }
     console.log(JSON.stringify(baselines, null, 2));
   " > new-baselines.json
   ```

3. **Update `performance/baselines/baselines.json`:**
   ```json
   {
     "version": "1.0.0",
     "baselines": {
       "baseline_health": 50,
       "baseline_patient_list": 400,
       "baseline_patient_search": 500,
       "baseline_encounter_list": 500,
       "baseline_appointment_list": 500,
       "baseline_payment_list": 500,
       "baseline_dashboard_stats": 900
     },
     "regression_threshold_percent": 20
   }
   ```

4. **Document the change in the commit message:**
   ```bash
   git add performance/baselines/baselines.json
   git commit -m "perf: update baselines after API optimization
   
   - patient_list: 500ms → 400ms (database index added)
   - dashboard_stats: 1200ms → 900ms (caching layer added)
   
   Captured from staging environment after deploy #1234"
   ```

5. **Create a PR** — CI will validate new baselines don't regress

### Smoke Test on PRs

Every PR automatically runs a quick smoke test to catch major performance regressions:

- Duration: 1 minute
- Load: 5 requests/second
- Endpoints: login, patient list, payment creation
- Alert threshold: p95 exceeds baseline by 20%

This runs automatically via `.github/workflows/performance.yml` when a PR is created or updated.

### Regression Alerts

When p95 latency exceeds the baseline threshold:

| Severity | Condition | Action |
|----------|-----------|--------|
| 🟡 Warning | 10-20% over baseline | Review but may merge with justification |
| 🔴 Failure | >20% over baseline | **CI fails** — must fix or update baseline with rationale |

Performance test results are automatically posted as PR comments showing:
- Current p95 vs baseline for each endpoint
- Pass/fail status
- Link to full k6 report artifact

## Running Tests Locally

```bash
# Start dependencies
docker compose up -d mongodb redis

# Start API
npm run dev --workspace=api

# Get auth token
AUTH_TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@clinic.com","password":"password"}' | jq -r '.accessToken')

# Run load test
AUTH_TOKEN=$AUTH_TOKEN k6 run k6/load-test-scenarios.js
```
