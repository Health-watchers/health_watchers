# k6 Load Testing - Health Watchers

Comprehensive load testing suite for the Health Watchers healthcare platform using k6.

## Prerequisites

- k6 installed: https://k6.io/docs/getting-started/installation/
- API running on `http://localhost:3001` (or set `BASE_URL` env var)
- Valid auth token (set `AUTH_TOKEN` env var)

## Test Scenarios

### Smoke Test
- 1 virtual user, 1 minute
- Verifies all endpoints respond correctly
- Establishes baseline response times

```bash
k6 run smoke-test.js
```

### Load Test - Scalability (NEW)
- 10→50→100→50→0 virtual users
- 12 minute test duration
- Tests patient, encounter, and clinic endpoints
- Comprehensive performance metrics

```bash
k6 run load-test-scenarios.js
```

### Stress Test
- Ramp up to 200 virtual users over 5 minutes
- Hold for 10 minutes, ramp down
- Identifies system breaking point

```bash
k6 run stress-test.js
```

### Spike Test
- Sudden spike to 500 users for 1 minute
- Verifies system recovery after spike

```bash
k6 run spike-test.js
```

## Performance Thresholds

| Metric | Target | Status |
|--------|--------|--------|
| p95 response time | < 500ms | ✓ |
| p99 response time | < 2000ms | ✓ |
| Error rate | < 1% | ✓ |
| Connection time p99 | < 200ms | ✓ |

## Running with Custom Configuration

```bash
# Set base URL
BASE_URL=https://api.example.com k6 run load-test-scenarios.js

# Set auth token
AUTH_TOKEN=your_token k6 run load-test-scenarios.js

# Generate summary JSON for analysis
k6 run load-test-scenarios.js --summary-export=summary.json

# Analyze results
node analyze-results.js summary.json analysis.json
```

## Results Analysis

Results analyzer identifies bottlenecks and provides recommendations.

**Generate analysis:**
```bash
k6 run load-test-scenarios.js --summary-export=summary.json
node analyze-results.js summary.json
```

**Output includes:**
- Threshold violations
- Performance bottlenecks
- Response time statistics (min, max, avg, p95, p99)
- Recommendations for optimization

## Test Execution

### Local Testing
```bash
# Smoke test (quick validation)
k6 run --vus 1 --duration 1m smoke-test.js

# Load test with auth token
AUTH_TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clinic.com","password":"password"}' \
  | jq -r '.accessToken') \
k6 run load-test-scenarios.js
```

### Cloud Execution (k6 Cloud)
```bash
# Upload and run on k6 Cloud
k6 cloud load-test-scenarios.js
```

## Interpreting Results

- **http_req_duration**: Response time distribution
- **http_req_failed**: Percentage of failed requests
- **group_duration{group:::*}**: Time for each logical operation group
- **checks**: Pass/fail assertions for business logic

**Example thresholds violation:**
```
✗ group_duration{group:::Patient Endpoints} .... failed [2/3] (66.66%)
  ✗ p(95)<1000 ............... avg=1250ms, p(95)=1500ms, p(99)=2000ms
```

## Bottleneck Analysis

Common bottlenecks identified:

1. **High p99 Response Time** (> 2000ms)
   - Cause: Database query performance
   - Action: Review indexes, query optimization, consider caching

2. **High Connection Time** (> 200ms p99)
   - Cause: Network latency or connection pool exhaustion
   - Action: Check connection pooling, increase pool size

3. **High Failure Rate** (> 1%)
   - Cause: Resource exhaustion or API errors
   - Action: Scale services, fix error handling, increase timeouts

## CI Integration

Smoke test runs on every PR:
```yaml
- name: Run smoke test
  run: k6 run --vus 1 --duration 1m smoke-test.js
```

Full load test runs on schedule:
```yaml
schedule:
  - cron: '0 2 * * 0'  # Weekly at 2 AM
```

## Best Practices

1. **Run locally first** before cloud execution
2. **Tag scenarios** for filtering results: `--tag smoke:true`
3. **Use realistic data** with actual patient/encounter counts
4. **Monitor database** during tests (CPU, memory, connections)
5. **Test after deployments** to catch performance regressions
6. **Archive results** in summary reports for trending

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection refused | Ensure API running on correct port |
| Auth failures | Verify AUTH_TOKEN is valid and not expired |
| High error rates | Check API logs, verify test data exists |
| Timeout errors | Increase threshold or reduce VU count |
| Memory errors | Run on fewer VUs or split test into stages |

## Resources

- [k6 Documentation](https://k6.io/docs/)
- [k6 Performance Testing Guide](https://k6.io/blog/performance-testing/)
- [Health Watchers API Docs](../docs/API_DOCUMENTATION.md)
