# ADR-006: Caching Strategy

## Status

Accepted

## Date

2024-03-18

## Context

Several API endpoints are expensive to compute:

- Paginated patient lists require aggregation over potentially thousands of records per clinic
- Dashboard reports aggregate encounter, appointment, and billing data
- The XLM/USD exchange rate is fetched from an external API and changes infrequently
- Risk scores are recalculated by a background job and change only periodically

Reading from MongoDB on every request would strain the database under concurrent clinic users. A caching layer is needed, but it must:

- Degrade gracefully when Redis is unavailable (development environments, Redis failures)
- Not serve stale data after mutations (patients created/updated/deleted)
- Never cache PHI in a way that leaks between clinics
- Provide observability into cache effectiveness

## Decision

Use **Redis** (via `ioredis`) as the sole caching backend, implemented in `apps/api/src/services/cache.service.ts`.

### Key design principles

**1. Graceful fallback**

If `REDIS_URL` is not set, `getClient()` returns `null`. All cache methods (`get`, `set`, `del`, `delPattern`) no-op silently when the client is null, and `get` returns `null` causing a cache miss that falls through to the database. This means the application runs correctly — just more slowly — without Redis.

```typescript
// From cache.service.ts
function getClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null; // graceful no-op
  ...
}
```

**2. Structured key naming**

Cache keys follow the pattern `{clinicId}:{METHOD}:{path}` or `{resource}:{subtype}:{clinicId}:{page}`. This:
- Scopes all data to a clinic (no cross-clinic leakage)
- Enables efficient wildcard invalidation with `delPattern`

Examples:
```
patients:list:<clinicId>:page:1:limit:20
<clinicId>:GET:/reports/summary
xlm:usd:rate
```

**3. Pattern-based invalidation (SCAN, not KEYS)**

Invalidation uses `SCAN` in a cursor loop rather than `KEYS` to avoid blocking the Redis event loop on large keyspaces. Deletions are batched in chunks of 500 to avoid oversized `DEL` commands.

Two domain-specific helpers encapsulate invalidation logic:

```typescript
cache.invalidatePatientList(clinicId)  // deletes patients:list:<clinicId>:*
cache.invalidateReports(clinicId)      // deletes <clinicId>:GET:/reports/*
```

These are called from patient create/update/delete service methods.

**4. Cache warm-up registry**

A `registerWarmup()` function allows modules to declare frequently-accessed, slow-to-compute keys. On startup (after DB connects), `warmCache()` runs all registered loaders for keys that are currently absent. This prevents a cold-cache thundering-herd on fresh deployment.

**5. Hit/miss metrics**

The cache service tracks `hits` and `misses` counters in-process and logs a hit-rate report every 5 minutes:

```
[cache] hit-rate report { cacheHits: 412, cacheMisses: 38, cacheHitRate: 0.9155 }
```

These appear in the Pino JSON log stream and are visible in Grafana/CloudWatch dashboards.

### TTL values

| Cache entry | TTL | Rationale |
|-------------|-----|-----------|
| Patient list page | 60 s | Acceptable staleness; invalidated on mutation |
| Report aggregations | 300 s | Reports are expensive; 5 min staleness is acceptable |
| XLM/USD exchange rate | 300 s | Rate changes slowly; background job refreshes it |
| Risk score | 600 s | Recalculated by background job every 10 min |

### Redis client options

```typescript
new Redis(url, {
  maxRetriesPerRequest: 1,   // fail fast; don't queue requests on Redis errors
  enableOfflineQueue: false, // immediately error rather than buffering
  lazyConnect: true,         // defer TCP connect to first use
})
```

`maxRetriesPerRequest: 1` and `enableOfflineQueue: false` ensure Redis errors are surfaced quickly and the fallback-to-DB path is taken immediately.

## Consequences

### Positive

- A single Redis instance shared across all API pods ensures consistent cache state and invalidation.
- Graceful fallback means Redis downtime does not take the application down.
- SCAN-based pattern invalidation is production-safe even on large keyspaces.
- Warm-up registry prevents cold-cache thundering-herd after deployments.
- Hit-rate logging provides visibility without requiring a dedicated metrics endpoint.

### Negative / Trade-offs

- Cache invalidation is eventual for the 60–600 s window if `invalidatePatientList`/`invalidateReports` is not called at every mutation point; callers must remember to invoke these helpers.
- Pattern-based invalidation (`delPattern`) is more expensive than key-level invalidation; misconfigured wildcards (e.g. `*`) could flush the entire keyspace.
- HIPAA requires encryption of PHI; cached values that contain PHI are stored as JSON strings in Redis. If Redis persistence (AOF/RDB) is enabled, the Redis volume must itself be encrypted at rest.

### Neutral

- The `resetCacheMetrics()` function is exported for test isolation — tests can reset counters between runs.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| In-process (memory) cache | Not shared across pods; cache is stale after a pod restart; bypass-able by distributing requests |
| Memcached | No pattern-based key expiry; no pub/sub for invalidation; ioredis + Redis is already in the stack for rate limiting |
| HTTP Cache-Control headers | Useful for public/static resources; not appropriate for clinic-scoped, authenticated API responses |
| Event-driven invalidation (Redis Pub/Sub) | More complex; SCAN-based invalidation is sufficient and simpler to reason about |

## References

- `apps/api/src/services/cache.service.ts` — full implementation
- `apps/api/src/app.ts` — warm-up registration and `warmCache()` call
- `apps/api/src/modules/caching/cache-debug.controller.ts` — admin cache inspection endpoint
- `apps/api/src/config/env.ts` — `REDIS_URL` production warning
