# Performance Issues

Diagnosis and resolution for slow responses, high memory, CPU spikes, and connection exhaustion.

---

## Table of Contents

- [Establishing a Baseline](#establishing-a-baseline)
- [Slow API Responses](#slow-api-responses)
- [Slow Queries](#slow-queries)
- [Connection Pool Exhaustion](#connection-pool-exhaustion)
- [High Memory Usage](#high-memory-usage)
- [High CPU Usage](#high-cpu-usage)
- [Memory Leaks](#memory-leaks)
- [Cache Misses & Cache Thrashing](#cache-misses--cache-thrashing)
- [Rate Limiter Overhead](#rate-limiter-overhead)
- [Background Job Interference](#background-job-interference)
- [Compression & Payload Size](#compression--payload-size)
- [Performance Tuning Reference](#performance-tuning-reference)

---

## Establishing a Baseline

Before optimizing, measure. Use the built-in Prometheus endpoint:

```bash
curl -u "$METRICS_USERNAME:$METRICS_PASSWORD" http://localhost:4000/metrics \
  | grep http_request_duration_seconds
```

Key percentiles to track:

| Percentile | Acceptable | Investigate | Critical |
|---|---|---|---|
| p50 (median) | < 50 ms | 50–200 ms | > 200 ms |
| p95 | < 200 ms | 200–500 ms | > 500 ms |
| p99 | < 500 ms | 500 ms–1 s | > 1 s |

Also check:
```bash
# MongoDB pool utilization
curl -s http://localhost:4000/metrics | grep mongodb_connection_pool

# Rate limit hits (indicates traffic pattern)
curl -s http://localhost:4000/metrics | grep rate_limit_hits_total
```

---

## Slow API Responses

### Step 1 — Identify the slow route

In Prometheus / Grafana, group `http_request_duration_seconds` by `route` label. The highest p99 routes are your targets.

Alternatively, search logs:
```bash
# Requests over 1 second (pino-http logs responseTime in ms)
jq 'select(.responseTime > 1000)' /var/log/api/app.log \
  | jq '{path: .req.url, method: .req.method, ms: .responseTime}'
```

### Step 2 — Check if it's a DB query

```bash
# Enable MongoDB slow query profiler (queries > 100ms)
mongosh "$MONGO_URI" --eval "db.setProfilingLevel(1, { slowms: 100 })"

# After reproducing the slow request, inspect:
mongosh "$MONGO_URI" --eval "
  db.system.profile.find({ millis: { \$gt: 100 } })
    .sort({ ts: -1 }).limit(10)
    .forEach(p => printjson({ ns: p.ns, millis: p.millis, planSummary: p.planSummary, query: p.query }))
"
```

### Step 3 — Check for N+1 queries

A route that loops and issues one DB query per item is an N+1 problem.

Signs: response time grows linearly with the number of items returned.

Fix: use `populate()` or a single aggregation pipeline instead of a per-item lookup. Check with `.explain()`:

```javascript
db.encounters.find({ patientId: ObjectId("...") }).explain("executionStats")
// Look at: totalDocsExamined vs nReturned
```

### Step 4 — Check compression

Large responses benefit from Brotli/gzip compression, which is enabled via `createCompressionMiddleware()`.

```bash
# Check compression metrics
curl http://localhost:4000/metrics/compression
```

If a route returns large JSON payloads (> 1 KB) and isn't being compressed, check the response `Content-Encoding` header.

---

## Slow Queries

### Missing index — most common cause

When a query does a `COLLSCAN` (full collection scan) instead of an `IXSCAN`, performance degrades with collection size.

```javascript
// Diagnose: run explain on the slow query
db.patients.find({ clinicId: ObjectId("..."), isActive: true })
  .explain("executionStats")

// Bad:  stage: "COLLSCAN", totalDocsExamined: 50000, nReturned: 12
// Good: stage: "IXSCAN",   totalDocsExamined: 12,    nReturned: 12
```

**Fix — add the missing index:**

```javascript
// Most patient queries are scoped by clinic + isActive
db.patients.createIndex({ clinicId: 1, isActive: 1 })

// Appointment queries by clinic + date range
db.appointments.createIndex({ clinicId: 1, scheduledAt: -1 })
```

Check `apps/api/src/migrations/QUERY_OPTIMISATION.md` for the full index strategy used by this project.

### Sort without supporting index

Sorting on an unindexed field causes an in-memory sort that hits the 32 MB BSON sort limit on large collections.

```javascript
// Add a compound index that covers both the filter and the sort
db.payments.createIndex({ clinicId: 1, createdAt: -1 })
```

### Regex queries on unindexed fields

```javascript
// Bad — full scan even with an index on name
db.patients.find({ name: /^John/ })

// Better — use a text index for search
db.patients.createIndex({ searchName: "text" })
db.patients.find({ $text: { $search: "John" } })
```

The project has a text search migration: `20260425_patient_text_search_index.ts`.

### Large `$in` arrays

`$in` with hundreds of IDs bypasses the optimizer on older MongoDB versions.

Fix: paginate the `$in` array into chunks of ≤ 100 IDs, or restructure the query to use a join via `$lookup`.

### Unbounded pagination

Fetching page 500 of a result set requires skipping 9,980 documents.

Fix: use cursor-based pagination (keyset pagination) instead of `skip()` for large datasets:

```javascript
// Instead of:
db.patients.find({ clinicId: ... }).skip(500 * 20).limit(20)

// Use keyset: remember the last _id from the previous page
db.patients.find({ clinicId: ..., _id: { $gt: lastId } }).limit(20)
```

---

## Connection Pool Exhaustion

### Symptoms

- `waitQueueTimeoutMS` errors in logs
- `db:pool:critical_utilization` log event
- Requests time out after ~5 seconds

### Diagnosis

```bash
# Check current pool metrics
curl -s http://localhost:4000/metrics \
  | grep -E 'mongodb_connection_pool_size|mongodb_pool_wait_queue'

# Direct MongoDB view
mongosh "$MONGO_URI" --eval "
  db.adminCommand({ serverStatus: 1 }).connections
"
# Look at: current, available, totalCreated
```

### Causes and fixes

| Cause | Fix |
|---|---|
| Pool too small for traffic | Increase `MONGODB_POOL_SIZE` (default 10) — but check DB server limit first |
| Slow queries holding connections | Add missing indexes; optimize queries |
| Missing `await` — connection not returned | Audit async route handlers for missing `await` on Mongoose calls |
| Connections leaked in tests | Ensure `mongoose.disconnect()` in test teardown |
| Too many replicas for one DB | Scale MongoDB read replicas or use a connection pooler (PgBouncer equivalent: MongoDB Atlas proxy) |

### Pool size guidance

```
Pool size = (avg concurrent requests × avg query time in ms) / 1000
```

For 100 concurrent requests at avg 50 ms query time: `100 × 0.05 = 5` connections minimum. Set `MONGODB_POOL_SIZE` to 2–3× that for headroom.

Environment variables:
```bash
MONGODB_POOL_SIZE=20               # max connections (default: 10)
MONGODB_MIN_POOL_SIZE=5            # min connections kept warm
MONGODB_WAIT_QUEUE_TIMEOUT_MS=5000 # how long to wait for a free connection
MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000
```

---

## High Memory Usage

### Baseline Node.js memory

```bash
# Check process memory
ps aux | grep "node dist/app.js"
# VSZ = virtual memory, RSS = resident set size (actual RAM used)

# Via /metrics
curl -s http://localhost:4000/metrics | grep nodejs_heap
```

Normal range for this app: 200–400 MB RSS.

### Common memory culprits

**1. Unbounded result sets**

Returning thousands of documents without pagination loads all of them into memory at once.

```javascript
// Bad
const all = await PatientModel.find({ clinicId });

// Good — always paginate
const page = await paginate(PatientModel, { clinicId }, 1, 20);
```

**2. Large in-memory cache**

The response cache stores serialized JSON. If the cache holds many large documents, RSS grows.

Check: `redis-cli -u "$REDIS_URL" INFO memory`

Fix: reduce cache TTL or limit cache entry size.

**3. Pino log buffer**

In high-throughput environments, Pino's async transport can buffer logs in memory.

Fix: use `sync: true` in development or tune the `transport` destination in production.

**4. Event listener accumulation**

Mongoose models and EventEmitters can accumulate listeners in long-running tests or hot-reload cycles.

Fix: check for `MaxListenersExceededWarning` in logs and call `.removeAllListeners()` in cleanup.

---

## High CPU Usage

### Identify the hot path

```bash
# Node.js CPU profile (requires --inspect flag)
node --inspect dist/app.js &
# Then connect Chrome DevTools → chrome://inspect
# Start CPU profile → send traffic → stop profile → analyze flame graph
```

### Common CPU culprits

**1. bcrypt rounds too high**

`bcrypt.compare()` is intentionally CPU-intensive. Default 10 rounds is fine; higher values block the event loop.

Check the `UserModel` schema for the salt rounds value.

**2. Synchronous JSON parsing of large payloads**

`JSON.parse()` on multi-MB bodies blocks the event loop.

Fix: enforce `MAX_REQUEST_BODY_SIZE` to cap payload size (default `10kb`).

**3. Unoptimized regex**

A catastrophic backtracking regex on a request field can spike CPU to 100% per request.

Fix: test regexes with [ReDoS checker](https://devina.io/redos-checker) before shipping.

**4. Excessive compression**

Brotli at quality 11 is CPU-heavy. The compression middleware uses a sensible default; do not raise quality above 6 for API responses.

---

## Memory Leaks

### Signs

- RSS grows monotonically over hours/days
- Heap used exceeds heap total repeatedly (GC can't keep up)
- Old-gen heap grows without corresponding traffic growth

### Diagnosing with heap snapshots

```bash
# Start with --inspect
node --inspect dist/app.js

# In Chrome DevTools → Memory → Take heap snapshot
# Reproduce the leak scenario
# Take a second snapshot
# Compare — look for objects with growing retained size
```

### Common leak patterns in this codebase

**1. Uncleaned interval/timeout refs**

All background jobs register intervals. If a job's `stop*` function is not called on shutdown, the interval keeps the module reference alive.

Verify: all `stop*Job()` functions are in `registerGracefulShutdown`'s `stopJobs` array in `app.ts`.

**2. Mongoose connection events not removed**

Event listeners on `mongoose.connection` survive hot reloads in development.

Fix: use `ts-node-dev` in dev (it restarts the full process on change), not a custom hot-reload.

**3. Unresolved promises**

A promise that neither resolves nor rejects keeps its closure in memory.

Fix: add timeouts to all external calls (Stellar, SMTP, S3). Use `Promise.race` with a timeout.

**4. Redis client not shared**

Each call to `createClient()` without connection reuse creates a new TCP connection and associated buffers.

Fix: use the shared Redis client instance from `services/redis.service.ts`.

---

## Cache Misses & Cache Thrashing

### Diagnosing cache hit rate

```bash
redis-cli -u "$REDIS_URL" INFO stats \
  | grep -E 'keyspace_hits|keyspace_misses'

# Hit rate = hits / (hits + misses)
# Below 80% means the cache is not effective
```

### Causes of low hit rate

| Cause | Fix |
|---|---|
| TTL too short | Increase TTL for stable data (ICD-10, clinic config) |
| Cache keys not consistent | Ensure query params are normalized before building the key |
| Cache invalidated too aggressively | Only invalidate on write — not on every request |
| Warmup not running | Check `[cache] startup warmup` log entries |

### Cache thrashing

Happens when high write volume constantly invalidates cache entries that are immediately re-fetched.

Fix: for write-heavy resources, skip caching entirely rather than cache-then-invalidate.

---

## Rate Limiter Overhead

The Redis-backed rate limiter adds ~1–2 ms per request (one Redis `INCR` call).

If this is noticeable:

1. Check Redis latency: `redis-cli -u "$REDIS_URL" --latency`
2. Ensure Redis is co-located with the API (same VPC / datacenter).
3. Use a Redis instance with persistence disabled (`appendonly no`) for purely ephemeral rate-limit data — reduces write overhead.

---

## Background Job Interference

Heavy background jobs (risk recalculation, reconciliation) share the MongoDB connection pool with API requests. During a large batch run, pool utilization spikes and API latency increases.

### Detect job interference

```bash
# Correlate pool utilization spikes with job schedules
# Pool metric logged every 30s by _startPoolMonitoring()
jq 'select(.event == "db:pool:high_utilization")' /var/log/api/app.log \
  | jq '{time: .time, utilization: .utilization}'
```

### Fixes

1. **Schedule heavy jobs during off-peak hours** — change the cron expression.
2. **Limit job batch size** — process records in smaller chunks with a delay between batches.
3. **Separate connection pool for jobs** — create a second Mongoose connection for background jobs with a smaller pool.
4. **Add a job semaphore** — prevent multiple heavy jobs from running concurrently.

---

## Compression & Payload Size

The API uses Brotli/gzip compression via `createCompressionMiddleware()`.

### Check if compression is active

```bash
curl -H "Accept-Encoding: gzip, deflate, br" \
  -I http://localhost:4000/api/v1/patients
# Look for: Content-Encoding: br  (Brotli) or  Content-Encoding: gzip
```

### Check compression savings

```bash
curl http://localhost:4000/metrics/compression
```

If a route shows low compression ratio, the response may already be binary (images, PDFs) — compression on already-compressed data adds CPU overhead with no size benefit. Exclude binary routes from the middleware.

---

## Performance Tuning Reference

| Variable | Default | What to change |
|---|---|---|
| `MONGODB_POOL_SIZE` | `10` | Increase for high concurrent load |
| `MONGODB_MIN_POOL_SIZE` | `2` | Increase to keep warm connections ready |
| `MONGODB_WAIT_QUEUE_TIMEOUT_MS` | `5000` | Decrease for faster fail-fast behavior |
| `MONGODB_SOCKET_TIMEOUT_MS` | `45000` | Decrease if you want faster query timeouts |
| `MAX_REQUEST_BODY_SIZE` | `10kb` | Keep low; raise only for specific routes |
| `OTEL_SAMPLING_RATE` | `1.0` dev / `0.1` prod | Lower in high-traffic prod to reduce tracing overhead |
| `LOG_LEVEL` | `info` | Set to `warn` in prod to reduce I/O |

### Quick wins checklist

```
[ ] All patient/appointment queries use clinicId compound index
[ ] Pagination applied on all list endpoints (max limit: 100)
[ ] REDIS_URL set — shared rate limiting + response cache
[ ] LOG_LEVEL=warn in production
[ ] OTEL_SAMPLING_RATE=0.1 in production
[ ] Background jobs scheduled during off-peak hours
[ ] No unbounded .find() calls without .limit()
[ ] All async route handlers use await (no floating promises)
```
