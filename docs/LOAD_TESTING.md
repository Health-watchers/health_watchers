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

Baselines are stored in `performance/baselines/baselines.json`.

To update baselines after intentional performance changes:
1. Run load test locally.
2. Update `performance/baselines/baselines.json` with new p95 values.
3. Commit and push.

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
