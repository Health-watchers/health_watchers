# Load Testing Documentation

This directory contains load testing scripts for the Health Watchers API using k6.

## Overview

Load testing is essential to understand how the API performs under realistic clinical load. A clinic with 50 concurrent users could overwhelm the API if it has N+1 query problems, missing indexes, or insufficient connection pooling.

## Performance Budgets

The following performance budgets must be met under 50 concurrent users:

- **p95 response time**: < 500ms
- **Error rate**: < 0.1%
- **Throughput**: > 100 req/s

## Test Scripts

### `patients.js`
Comprehensive load test for the patients endpoints:
- Tests patient creation (`POST /api/v1/patients`)
- Tests patient retrieval (`GET /api/v1/patients/:id`)
- Tests patient listing (`GET /api/v1/patients`)

### `api.js`
General API load test covering all main endpoints:
- Health check endpoint (`GET /health`)
- Auth endpoints (`GET /api/v1/auth`)
- Patients endpoints (`GET /api/v1/patients`)
- Encounters endpoints (`GET /api/v1/encounters`)
- Payments endpoints (`GET /api/v1/payments`)
- AI endpoints (`GET /api/v1/ai`)

## Running Load Tests

### Prerequisites

1. Install k6: `npm install k6` (already included in devDependencies)
2. Start the API server: `npm run dev` (from the api directory)

### Basic Usage

Run the patients load test:
```bash
npm run test:load
```

Run a specific test script:
```bash
k6 run tests/load/patients.js
k6 run tests/load/api.js
```

### Advanced Usage

Run with custom base URL:
```bash
BASE_URL=http://localhost:3000 k6 run tests/load/patients.js
```

Run with custom duration:
```bash
k6 run --duration=5m tests/load/patients.js
```

Run with custom user count:
```bash
k6 run --vus=100 tests/load/patients.js
```

### Environment Variables

- `BASE_URL`: The base URL of the API (default: `http://localhost:3000`)

## Test Configuration

### Stages

The load tests use the following stages:
1. **Ramp-up phase**: 30 seconds to reach 10 users
2. **Ramp-up phase**: 1 minute to reach 50 users
3. **Sustained load**: 2 minutes at 50 users
4. **Ramp-down phase**: 30 seconds to reach 0 users

### Thresholds

The tests enforce these thresholds:
- `http_req_duration`: 95% of requests must complete below 500ms
- `http_req_failed`: Error rate must be below 0.1%
- `http_reqs`: Throughput must be above 100 req/s
- `errors`: Custom error rate metric must be below 0.1%

## Performance Monitoring

### Metrics Collected

- Response times (average, p95, p99)
- Request rates
- Error rates
- Success rates per endpoint
- Custom error metrics

### Output

Test results are saved to:
- `load-test-results.json` (for patients test)
- `api-load-test-results.json` (for API test)
- Console output with detailed summary

## Performance Optimization Plan

If any endpoint fails to meet the p95 < 500ms requirement, the following optimizations should be considered:

### Database Optimizations
1. **Add indexes** for frequently queried fields
2. **Review query patterns** for N+1 problems
3. **Implement connection pooling** with appropriate limits
4. **Consider query caching** for read-heavy operations

### Application Optimizations
1. **Implement request/response compression**
2. **Add rate limiting** to prevent abuse
3. **Optimize middleware** execution order
4. **Review authentication/authorization** overhead

### Infrastructure Optimizations
1. **Scale horizontally** with load balancing
2. **Implement CDN** for static assets
3. **Optimize server configuration** (worker processes, memory)
4. **Monitor resource usage** (CPU, memory, network)

## Troubleshooting

### Common Issues

1. **High response times**:
   - Check database connection pool settings
   - Review query execution plans
   - Monitor server resource usage

2. **High error rates**:
   - Check server logs for errors
   - Verify database connectivity
   - Review middleware error handling

3. **Low throughput**:
   - Increase server resources
   - Optimize application code
   - Review network configuration

### Debug Mode

Run tests with verbose output:
```bash
k6 run --verbose tests/load/patients.js
```

### Local Testing

For local development, you can run shorter tests:
```bash
k6 run --duration=1m --vus=10 tests/load/patients.js
```

## Integration with CI/CD

Load tests can be integrated into your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Run Load Tests
  run: |
    npm run dev &
    sleep 10
    npm run test:load
```

## Monitoring and Alerting

Consider setting up monitoring for:
- Response time percentiles
- Error rates
- Request throughput
- Resource utilization

Alert when thresholds are exceeded to catch performance regressions early.