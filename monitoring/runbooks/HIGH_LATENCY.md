# High API Latency Runbook

## Alert
`HighP99Latency` — API p99 response time exceeds 2 s

## Severity
⚠️ Warning

## Description
The 99th-percentile response time for the Health Watchers API has exceeded 2 seconds for at least 2 consecutive minutes. This typically affects ~1 % of requests and may indicate a database slowdown, GC pressure, or resource saturation.

## Immediate Actions (< 5 minutes)

### 1. Identify affected endpoints
Open the **API Performance** dashboard in Grafana → panel **"Latency by Endpoint (p95 top 10)"**.

Or via Prometheus:
```promql
topk(10,
  histogram_quantile(0.99, sum by (path, le) (
    rate(http_request_duration_seconds_bucket{job="health-watchers-api"}[5m])
  ))
)
```

### 2. Check concurrent database load
```promql
# MongoDB connection pool wait queue
mongodb_pool_wait_queue_size{job="health-watchers-api"}

# p99 latency correlated with pool pressure
histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
```

### 3. Check Node.js event loop lag
```promql
nodejs_eventloop_lag_seconds{job="health-watchers-api"}
```
If > 100 ms, the process is CPU-bound or has a blocking operation.

### 4. Check GC activity
```promql
rate(nodejs_gc_duration_seconds_sum[5m])
```

## Common Causes and Fixes

### A. MongoDB slow queries
```bash
# Connect to primary
mongosh 'mongodb://root:${MONGO_ROOT_PASSWORD}@mongodb-primary:27017/admin'

# Current slow operations (> 100ms)
> db.adminCommand({ currentOp: 1, secs_running: { $gte: 0 }, ns: /health_watchers/ })

# Check slow query log
> db.setProfilingLevel(1, { slowms: 100 })
> use health_watchers
> db.system.profile.find().sort({ ts: -1 }).limit(10)
```

**Fix:** Add missing index, kill long-running queries if blocking.

### B. Node.js GC pauses / memory pressure
```bash
# Check container memory
docker stats health-watchers-api

# In Grafana: check "Node.js Heap Used" panel
```

**Fix:** Increase container memory limit. If heap is consistently > 80 %, identify memory leak.

### C. Downstream service slow (Stellar / Gemini API)
```promql
histogram_quantile(0.99, sum by (route, le) (
  rate(http_request_duration_seconds_bucket{job="health-watchers-api",route=~".*stellar.*|.*payment.*"}[5m])
))
```

**Fix:** Add circuit breaker, increase timeouts, or add caching for external calls.

### D. High CPU
```promql
rate(process_cpu_seconds_total{job="health-watchers-api"}[5m])
```

**Fix:** Scale horizontally or identify hot code path.

## Escalation

| Duration | Action |
|---|---|
| 2 – 10 min | Investigate this runbook |
| 10 – 30 min | Page on-call engineer |
| > 30 min | Incident response — involve backend lead |

## Prevention

- Set MongoDB indexes on all queried fields
- Use `maxPoolSize` appropriately for expected concurrency
- Enable Node.js cluster mode for CPU-bound APIs
- Set resource limits and alert on CPU/memory approaching limits

## Related Alerts
- `HighErrorRate`
- `MongoDBPoolWaitQueueNonEmpty`
- `MongoDBHighQueryLatency`

## Related Runbooks
- `HIGH_ERROR_RATE.md`
- `MONGODB_POOL_WAIT_QUEUE.md`
