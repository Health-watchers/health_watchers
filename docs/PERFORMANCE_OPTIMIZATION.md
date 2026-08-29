# Performance Optimization

Health Watchers production performance guide.

## Profiling

### Application Profiling

- Use `clinic` (clinic.js) to profile CPU, heap, and event-loop latency.
- Use Node.js `--inspect` + Chrome DevTools for CPU profiling.
- Use MongoDB Atlas Performance Advisor or `db.system.profile` for slow queries.

Example slow query log:
```bash
db.setProfilingLevel(2, { slowms: 100 });
db.system.profile.find({ millis: { $gt: 100 } }).sort({ ts: -1 }).limit(20);
```

### Key Metrics

| Metric | Target | Action if Exceeded |
|--------|--------|-------------------|
| API p95 latency | < 500ms | Profile DB queries, check missing indexes |
| API p99 latency | < 2000ms | Scale read replicas, review locks |
| Health check latency | < 50ms | Keep lightweight, no DB dependency |
| Error rate | < 1% | Check 5xx logs, DB timeouts, memory pressure |
| Connection time p99 | < 200ms | Increase pool size, check network |

## Query Optimization

### Read Preferences

Route queries by criticality:

- **Critical writes / patient updates**: `primary`, `w: 'majority'`, `j: true`
- **General reads**: `secondaryPreferred`, `maxStalenessSeconds: 120`
- **Analytics / reports**: `secondary`, `w: 1`, `maxStalenessSeconds: 300`
- **Low-latency dashboards**: `nearest`, `w: 1`

See `apps/api/src/config/db-replication.ts` for configurations.

### Index Strategy

- Index `.find()` and `.sort()` fields used together.
- Use compound indexes for frequent filter + sort patterns.
- Avoid index-only queries that return large documents; project only needed fields.
- Monitor index hit ratio in MongoDB Atlas / `db.collection.stats()`.

### Aggregation Pipeline

- Pipeline early `$match` stages to reduce document volume.
- Use `$lookup` with pipeline to limit joined results.
- Avoid `$group` on unindexed fields in hot paths.

## Caching Static Assets

### API Response Caching

The API uses `cacheResponse` middleware (`apps/api/src/middlewares/cache.middleware.ts`) backed by Redis.

Recommended TTLs:
- `/api/v1/patients` (public lists): 60 seconds
- `/api/v1/clinics`: 300 seconds
- `/api/v1/icd10` lookup: 86400 seconds
- Dashboard summaries: 30 seconds

Cache invalidation occurs on creates/updates/deletes via `cache.delPattern`.

### Redis Configuration

- Use Redis 7+ for improved memory efficiency.
- Set `maxmemory-policy allkeys-lru` to bound memory.
- Monitor hit rate via `/health/cache` or `getCacheMetrics()`.

## CDN Configuration

The Next.js frontend already supports CDN via environment variables:

```env
NEXT_PUBLIC_CDN_URL=https://cdn.example.com
NEXT_PUBLIC_CDN_PROVIDER=cloudflare
CDN_API_KEY=your_api_key
```

### Configure CDN

1. Set `NEXT_PUBLIC_CDN_URL` to your distribution domain.
2. Set `NEXT_PUBLIC_CDN_PROVIDER` to `cloudflare`, `cloudfront`, `fastly`, or `custom`.
3. Provide provider API key in `CDN_API_KEY`.
4. For CloudFront, also set `CLOUDFRONT_DISTRIBUTION_ID` and AWS credentials.
5. For Cloudflare, set `CLOUDFLARE_ZONE_ID`.

### Cache Headers

Immutable assets are served with:
- `Cache-Control: public, max-age=31536000, immutable`
- Versioned asset URLs via `NEXT_PUBLIC_APP_VERSION`

### Cache Invalidation

Invalidate CDN cache on deploy or content update:
```bash
POST /api/v1/cdn/cache-invalidation
{
  "paths": ["/fonts/*", "/images/*"],
  "provider": "all"
}
```

## Monitoring

- Track p95/p99 latency per endpoint via Prometheus / Sentry.
- Alert when p95 exceeds 500ms or error rate exceeds 1%.
- Review MongoDB slow query log weekly.
- Monitor Redis hit rate: `< 90%` indicates TTL or key-pattern issues.
