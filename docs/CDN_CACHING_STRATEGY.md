# CDN & Caching Strategy

How Health Watchers serves static assets and cacheable responses through a CDN,
and how the edge is configured, monitored, and operated. The application-side
helpers already exist (`apps/web/src/lib/cdn.ts`,
`apps/api/src/services/cdn-config.service.ts`, the
`/api/v1/cdn/*` routes). This document covers the **edge / infrastructure**
layer and ties it together.

| Attribute | Value |
|-----------|-------|
| Primary provider | AWS CloudFront (config: `ops/cdn/cloudfront-distribution.json`) |
| Alternative | Cloudflare (config: `ops/cdn/cloudflare-config.yaml`) |
| Origin | ALB → `health-watchers-web` / `health-watchers-api`, with a failover origin in the DR region |
| Compression | gzip + Brotli at the edge and at the origin (`ops/cdn/nginx-cache.conf`) |
| WAF / DDoS | AWS WAF + Shield Advanced / Cloudflare WAF + rate limiting (`ops/cdn/waf-rules.json`) |
| Targets | ≥ 95% cache hit ratio on static, 50% faster page loads, ≥ 30% origin cost saving |
| Owner | Platform Engineering |

## 1. What is cached where

| Content | Path pattern | TTL (edge) | Cache-Control (origin) | Notes |
|---------|--------------|-----------|------------------------|-------|
| Hashed JS/CSS/fonts | `/_next/static/*`, `*.[hash].*` | 1 year | `public, max-age=31536000, immutable` | Never invalidated — filename changes on deploy |
| Images (optimized) | `/_next/image*`, `/images/*` | 30 days | `public, max-age=2592000, stale-while-revalidate=86400` | Next.js image optimizer + edge resize |
| Public marketing pages | `/`, `/about`, `/pricing` | 1 h + SWR | `public, s-maxage=3600, stale-while-revalidate=86400` | HTML, revalidated in the background |
| App shell (authed) | `/app/*` | 0 | `private, no-store` | Never cached at the edge |
| API — reference data | `/api/v1/icd10*`, `/api/v1/catalog*` | 5 min | `public, s-maxage=300` | Safe, non-personal |
| API — everything else | `/api/*` | 0 | `private, no-store` | PHI — never cached |

Cache key: URI + `Accept-Encoding` + `Accept-Language` (marketing) ; auth cookie
is stripped from the cache key for public content and forwarded (uncached) for
app/API. Query strings are normalised (allow-list) to avoid cache fragmentation.

## 2. Compression

- Edge: Brotli (q5) preferred, gzip fallback, for text/*, JS, CSS, JSON, SVG,
  fonts. Binary/image formats are passed through.
- Origin: `nginx` also compresses (`ops/cdn/nginx-cache.conf`) so cache misses
  and non-CDN traffic still get compressed bytes. `gzip_static` / `brotli_static`
  serve pre-compressed `.br` / `.gz` artifacts produced at build time.
- Min size to compress: 1 KB.

## 3. Versioned asset naming

Next.js emits content-hashed filenames under `/_next/static/`. The build also
writes `NEXT_PUBLIC_APP_VERSION` (git SHA) which `getVersionedAssetUrl()` appends
to any non-hashed asset. Because immutable assets change name on every deploy, we
**never** purge them — old and new coexist, and clients pick up the new HTML
which references the new hashes.

## 4. Cache invalidation

- API: `POST /api/v1/cdn/cache-invalidation` (admin) — already implemented,
  multi-provider, with a bulk priority-queued variant.
- CLI / CI: `scripts/cdn/purge-cache.sh` wraps the same providers for use in the
  deploy pipeline and runbooks.
- On deploy, the `cdn-invalidate-on-deploy` workflow purges only mutable paths
  (`/`, `/api/v1/icd10*`, sitemap, `robots.txt`) and then warms them.
- Emergency "purge everything": `scripts/cdn/purge-cache.sh --all --yes`
  (also invoked by `scripts/dr/failover.sh`).

## 5. Origin failover & high availability

- **CloudFront**: an Origin Group with primary = `us-east-1` ALB, secondary =
  `eu-west-1` ALB. Failover criteria: 502/503/504 or connection timeout.
- **Cloudflare**: a Load Balancer with two origin pools and health monitors
  (`/health`, every 15 s, 2 failures = unhealthy).
- Edge continues serving cacheable content from cache during an origin outage
  (`stale-if-error=86400`).
- Region failover of the origin itself is handled by
  [`scripts/dr/failover.sh`](../scripts/dr/failover.sh), which also repoints the
  CDN origin and purges.

## 6. DDoS protection & WAF

`ops/cdn/waf-rules.json`:

- Managed rule sets: Core (OWASP), Known-Bad-Inputs, IP-reputation, Anonymous-IP.
- Rate limiting: 2 000 req / 5 min / IP globally; 100 req / 5 min / IP on
  `/api/v1/auth/*`; 20 req / min / IP on `/api/v1/auth/login`.
- Bot control: challenge non-browser traffic to marketing pages; block
  data-center ASNs on auth endpoints.
- L3/L4: AWS Shield Advanced (or Cloudflare's always-on mitigation) on the
  distribution; health-based DNS failover.
- Geo: no hard country block (healthcare users travel); high-risk geos get a
  managed challenge on auth.

## 7. Monitoring & reporting

- Prometheus alerts: [`monitoring/alerts-cdn.yml`](../monitoring/alerts-cdn.yml)
  — cache hit ratio < 95%, origin error ratio, origin latency, failover active,
  WAF block spike, cost anomaly.
- `scripts/cdn/cdn-performance-report.sh` — pulls provider analytics: hit ratio,
  bytes served vs origin bytes (and $ saved), edge p50/p95 TTFB, top cache
  MISSes, 4xx/5xx by edge location. Runs weekly in `cdn-invalidate-on-deploy`
  and writes metrics + a Markdown report.
- `scripts/cdn/verify-cache-headers.sh` — post-deploy smoke test: every asset
  class returns the expected `Cache-Control`, `Content-Encoding`, and
  `X-Cache: Hit` on the second request.
- Grafana: "CDN" dashboard row (hit ratio, origin offload, TTFB, error rate,
  cost/GB).

## 8. Rollout

1. Create the distribution from `ops/cdn/cloudfront-distribution.json`
   (`aws cloudfront create-distribution --distribution-config file://...`) or
   apply `cloudflare-config.yaml` via the provider Terraform/API.
2. Attach the WAF web ACL from `waf-rules.json`.
3. Set `NEXT_PUBLIC_CDN_URL` / `NEXT_PUBLIC_CDN_PROVIDER` (see `.env.cdn.example`)
   and redeploy web.
4. Point `cdn.health-watchers.io` (CNAME) at the distribution; keep the apex on
   the ALB.
5. `scripts/cdn/verify-cache-headers.sh --base https://app.health-watchers.io`.
6. Watch the CDN dashboard for 24 h; confirm hit ratio climbs past 95% and
   origin egress drops.

## 9. Acceptance criteria mapping

| Criterion | How it is met |
|-----------|---------------|
| Static assets cached effectively | Immutable 1-year TTL on hashed assets; `verify-cache-headers.sh` gate |
| Page load times improved 50% | Edge delivery + Brotli + image opt; tracked via `cdn-performance-report.sh` TTFB and web-vitals |
| Cache hit ratio > 95% | `CDNCacheHitRatioLow` alert + weekly report; cache-key normalisation |
| Cost savings 30% | Origin-offload bytes in the weekly report vs pre-CDN baseline; `monitoring/alerts-cdn.yml` cost anomaly |
