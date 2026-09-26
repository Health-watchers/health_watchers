# ADR-020: Rate Limiting and Throttling

## Status

Accepted

## Date

2024-07-01

## Context

A healthcare API is a high-value target for:

- Brute-force attacks on authentication endpoints
- Credential stuffing (automated login attempts with stolen credentials)
- Denial-of-service attacks that would prevent clinicians from accessing patient records
- Automated scraping of patient data

Rate limiting must be:

- **Distributed** — enforced consistently across all API pods (per-pod limits are trivially bypassed)
- **Granular** — stricter limits on sensitive endpoints (auth, MFA) than on general API traffic
- **Configurable** — adjustable without a code deploy when threat patterns change
- **Observable** — rate-limit events must be visible in dashboards

## Decision

### express-rate-limit with a Redis store

`express-rate-limit` is used with a Redis-backed store. Redis is the shared counter across all pods; a pod restart or scale-out event does not reset any client's counter.

If `REDIS_URL` is not set in production, counters fall back to in-memory per-pod storage. A startup warning is emitted (`env.ts`): this is a known degraded state, not a silent failure.

### Rate limit tiers

Three tiers are applied, from most restrictive to least:

| Tier | Applied to | Window | Max requests | Action on exceed |
|------|-----------|--------|-------------|-----------------|
| **Auth limiter** | `/auth/login`, `/auth/register`, `/auth/forgot-password` | 15 min | 10 | 429 + `Retry-After` header |
| **MFA limiter** | `/auth/mfa-verify`, `/auth/mfa-setup` | 15 min | 5 | 429 + account lockout flag |
| **General limiter** | All `/api/v1/*` and `/api/v2/*` | 15 min | 300 (authenticated) / 60 (unauthenticated) | 429 |

The `generalLimiter` is applied to all API routes as the outermost limit. Stricter limiters are composed on top for sensitive routes.

Rate-limit headers are returned on every response (including non-limited responses), matching the IETF `RateLimit-*` draft standard:

```
RateLimit-Limit: 300
RateLimit-Remaining: 247
RateLimit-Reset: 1735689600
```

These headers are exposed via CORS (`exposedHeaders`) so browser clients can read them.

### IP-based limiting with trust proxy

The limiter key is `req.ip`. `app.set('trust proxy', 1)` is configured so `req.ip` is the real client IP from the `X-Forwarded-For` header set by NGINX, not the proxy IP. Without this, every request from behind the load balancer would share a single counter.

### Rate-limit monitoring middleware

`rateLimitMonitor` middleware runs before the general limiter on every versioned route. It records rate-limit near-misses (> 80 % of limit consumed) and exact limit hits as structured log events, which feed into Prometheus metrics and Grafana dashboards.

### Admin-configurable rate limits

Rate-limit configuration is stored in a `rate_limit_config` collection, editable by SUPER_ADMIN via `/api/v2/rate-limit-config`. Changes take effect on the next request to the affected route without a pod restart. This allows rapid response to attack patterns without a deployment.

### Account lockout (complement to rate limiting)

Rate limiting operates at the network layer. Account lockout (see ADR-007) operates at the application layer. Both are required:

- Rate limiting blocks bulk automated attempts from reaching the application
- Account lockout prevents targeted slow-burn attacks that stay below the rate limit

## Consequences

### Positive

- Redis-backed counters are shared across all pods; distributing requests across pods does not bypass the limit.
- Separate tiers prevent legitimate API traffic from being affected when auth endpoints are under attack.
- `RateLimit-*` headers allow clients to implement proactive back-off rather than polling until they receive a 429.
- Admin-configurable limits allow operational response to attacks without a deployment.

### Negative / Trade-offs

- Redis is a critical dependency for distributed rate limiting; a Redis outage degrades security posture (falls back to per-pod in-memory counters). Redis Sentinel or Cluster is recommended for HA production.
- IP-based rate limiting can incorrectly throttle legitimate users behind a shared NAT (e.g. a hospital with a single outbound IP). User-ID-based rate limiting for authenticated routes is a future improvement.
- Configuring three tiers adds complexity; all tier configurations must be kept in sync between code defaults and the admin-configurable collection.

### Neutral

- `Retry-After` header on 429 responses is required by RFC 6585 and helps well-behaved clients back off correctly.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| NGINX rate limiting only | Cannot enforce per-user or per-endpoint granularity at the application layer; NGINX limits are IP-only |
| In-process memory only | Not shared across pods; trivially bypassed in multi-replica deployments |
| API Gateway (Kong, AWS API GW) | Adds infrastructure complexity and cost; application-layer rate limiting is sufficient and more flexible |
| User-ID-based limiting only | Does not protect unauthenticated endpoints (login, registration) that are the primary brute-force targets |

## References

- `apps/api/src/middlewares/rate-limit.middleware.ts`
- `apps/api/src/middlewares/rate-limit-monitor.middleware.ts`
- `apps/api/src/modules/rate-limiting/rate-limit-config.controller.ts`
- `apps/api/src/app.ts` — trust proxy configuration, limiter mounting
- `apps/api/src/config/env.ts` — Redis URL production warning
- `docs/API_RATE_LIMITING.md`
