# API Rate Limiting Documentation

Health Watchers uses [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) with a Redis-backed **sliding window** store (falling back to in-memory for local development). All limiters return standard IETF rate-limit headers, a `Retry-After` header on `429` responses, and a consistent `429` error body.

---

## Table of Contents

- [Rate Limit Summary](#rate-limit-summary)
- [Response Headers](#response-headers)
- [Error Response](#error-response)
- [Examples](#examples)
- [Limiter Details](#limiter-details)
- [Storage Backend](#storage-backend)
- [Bypass & Limit Increases](#bypass--limit-increases)
- [Metrics & Monitoring](#metrics--monitoring)

---

## Rate Limit Summary

All limiters use a **sliding window** algorithm: the counter is evaluated over the trailing window (e.g. the last 15 minutes) rather than a fixed bucket that resets abruptly. This prevents burst traffic from "doubling up" at window boundaries.

| Limiter | Sensitivity | Window | Max Requests | Key | Scope |
|---------|-------------|--------|-------------|-----|-------|
| `authLimiter` | Critical | 15 minutes | 5 | IP address | `POST /api/v1/auth/login` |
| `registerLimiter` | Critical | 1 hour | 5 | IP address | `POST /api/v1/auth/register` |
| `forgotPasswordLimiter` | Critical | 1 hour | 3 | IP address | `POST /api/v1/auth/forgot-password` |
| `mfaLimiter` | Critical | 15 minutes | 5 | `userId` (fallback: IP) | `/api/v1/portal/mfa/*` |
| `aiLimiter` | High | 1 minute | 20 | `clinicId` (fallback: IP) | `/api/v1/ai/*` and `/api/v2/ai/*` |
| `paymentLimiter` | High | 1 minute | 20 | `clinicId` (fallback: IP) | Payment endpoints |
| `bulkExportLimiter` | High | 1 hour | 5 | `userId` (fallback: IP) | `/api/v1/export/*` (PHI export) |
| `reportGenerationLimiter` | Medium | 1 hour | 10 | `userId` (fallback: IP) | Report generation |
| `patientSearchLimiter` | Medium | 1 minute | 100 | `userId` (fallback: IP) | Patient search |
| `generalLimiter` | Low | 15 minutes | 300 | IP address | All `/api/v1/*` and `/api/v2/*` routes |

### Endpoint Sensitivity Classification

| Sensitivity | Endpoints | Rationale |
|-------------|-----------|-----------|
| **Critical** | `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/portal/mfa/*` | Direct attack surface for credential stuffing, account enumeration, and MFA brute-forcing. Strictest limits. |
| **High** | `/export/*`, `/ai/*`, payment endpoints | PHI exfiltration risk (bulk export), expensive inference (AI), and financial impact (payments). |
| **Medium** | Patient search, report generation | Enumeration and resource-exhaustion risk, but lower blast radius. |
| **Low** | All other `/api/v1/*` and `/api/v2/*` routes | Catch-all abuse protection. |

---

## Response Headers

Every response from a rate-limited endpoint includes these standard IETF headers:

| Header | Description |
|--------|-------------|
| `RateLimit-Limit` | Maximum requests allowed in the window |
| `RateLimit-Remaining` | Requests remaining in the current window |
| `RateLimit-Reset` | UTC epoch seconds when the window resets |
| `Retry-After` | Seconds to wait before retrying (only on `429` responses) |

> **Note:** Legacy `X-RateLimit-*` headers are **disabled** (`legacyHeaders: false`).

### `Retry-After` semantics

- `Retry-After` is emitted **only** on `429` responses.
- The value is an integer number of **seconds** (delta-seconds form, not an HTTP date).
- With the sliding window store, the value is computed from the oldest request still inside the window, so it reflects the exact time until capacity frees up — it is never longer than the configured window.
- Clients **must** honour `Retry-After` rather than using a fixed back-off delay.

---

## Error Response

When a limit is exceeded the API returns HTTP `429` with a `Retry-After` header and a JSON body.

**HTTP 429 example — login endpoint:**

```
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
RateLimit-Limit: 5
RateLimit-Remaining: 0
RateLimit-Reset: 1719489600
Retry-After: 847
```

```json
{
  "error": "TooManyRequests",
  "message": "Too many login attempts. Try again in 15 minutes."
}
```

The `error` field is always `"TooManyRequests"`. The `message` field is human-readable and specific to the endpoint. See [Limiter Details](#limiter-details) for each limiter's exact message.

### All 429 Messages by Limiter

| Limiter | 429 message |
|---------|-------------|
| `authLimiter` | `"Too many login attempts. Try again in 15 minutes."` |
| `registerLimiter` | `"Too many registration attempts. Try again in 1 hour."` |
| `forgotPasswordLimiter` | `"Too many password reset requests. Try again in 1 hour."` |
| `mfaLimiter` | `"Too many MFA attempts. Try again in 15 minutes."` |
| `aiLimiter` | `"AI rate limit exceeded. Try again in 1 minute."` |
| `paymentLimiter` | `"Payment rate limit exceeded. Try again in 1 minute."` |
| `generalLimiter` | `"Too many requests. Try again in 15 minutes."` |
| `bulkExportLimiter` | `"Bulk export limit: 5 per hour. Try again later."` |
| `patientSearchLimiter` | `"Search rate limit exceeded. Try again in 1 minute."` |
| `reportGenerationLimiter` | `"Report generation limit: 10 per hour. Try again later."` |

---

## Examples

### Login — 5 requests per 15 minutes per IP

```bash
# First 5 requests succeed
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://api.healthwatchers.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}'
# → 200 or 401

# 6th request within 15 minutes returns rate limit error
curl -s -X POST https://api.healthwatchers.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}'
# HTTP 429
# Retry-After: 847
# {"error":"TooManyRequests","message":"Too many login attempts. Try again in 15 minutes."}
```

### AI endpoint — 20 requests per minute per clinic

```bash
curl -s -X POST https://api.healthwatchers.com/api/v1/ai/summarize \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"patientId":"60c72b2f9b1d8e1a4c8d0001"}'
# → 200 while under 20/min for your clinic
# → 429 after the 20th request, with Retry-After: 60
```

### Patient search — 100 requests per minute per user

```bash
curl -s "https://api.healthwatchers.com/api/v1/patients/search?q=smith" \
  -H "Authorization: Bearer <jwt>"
# → 200 for the first 100 requests in the current minute window
# → 429 on the 101st request
```

### Bulk export — 5 requests per hour per user

```bash
curl -s -X POST https://api.healthwatchers.com/api/v1/export/patients \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"format":"csv","filters":{}}'
# → 200 for up to 5 exports per hour
# → 429 on the 6th export within the hour
```

### General API — checking headers on a healthy response

```bash
curl -sv https://api.healthwatchers.com/api/v1/patients \
  -H "Authorization: Bearer <jwt>" 2>&1 | grep -i ratelimit
# < RateLimit-Limit: 300
# < RateLimit-Remaining: 299
# < RateLimit-Reset: 1719489600
```

### Handling 429 in client code (TypeScript)

```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.status !== 429) return res;

    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
    console.warn(`Rate limited. Retrying after ${retryAfter}s (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
  }
  throw new Error('Rate limit exceeded after max retries');
}

// Usage
const response = await fetchWithRetry(
  '/api/v1/patients/search?q=smith',
  { headers: { Authorization: `Bearer ${token}` } }
);
```

---

## Limiter Details

### `authLimiter`

- **Route**: `POST /api/v1/auth/login`
- **Window / Max**: 15 min / 5 per IP
- **Key**: `req.ip`
- **429 message**: `"Too many login attempts. Try again in 15 minutes."`
- **Rationale**: Protects against brute-force login attacks. Uses the sliding window store, so capacity is regained gradually as old attempts age out of the trailing 15-minute window.

---

### `registerLimiter`

- **Route**: `POST /api/v1/auth/register`
- **Window / Max**: 1 hour / 5 per IP
- **Key**: `req.ip`
- **429 message**: `"Too many registration attempts. Try again in 1 hour."`
- **Rationale**: Prevents automated account creation and abuse of the registration flow.

---

### `mfaLimiter`

- **Routes**: `/api/v1/portal/mfa/*` (MFA setup, verification, and challenge endpoints)
- **Window / Max**: 15 min / 5 per user
- **Key**: `req.user.userId` (falls back to `req.ip`)
- **429 message**: `"Too many MFA attempts. Try again in 15 minutes."`
- **Rationale**: Blocks brute-forcing of one-time codes and repeated MFA challenge attempts.

---

### `forgotPasswordLimiter`

- **Route**: `POST /api/v1/auth/forgot-password`
- **Window / Max**: 1 hour / 3 per IP
- **Key**: `req.ip`
- **429 message**: `"Too many password reset requests. Try again in 1 hour."`
- **Rationale**: Prevents password-reset enumeration attacks and avoids spamming users with reset emails.

---

### `aiLimiter`

- **Routes**: `/api/v1/ai/*` and `/api/v2/ai/*` (AI summaries, risk scoring, drug interactions, etc.)
- **Window / Max**: 1 min / 20 per clinic
- **Key**: `req.user.clinicId` from the decoded JWT (falls back to `req.ip` for unauthenticated requests)
- **429 message**: `"AI rate limit exceeded. Try again in 1 minute."`
- **Rationale**: AI inference calls are computationally expensive. The per-clinic key ensures all users in a clinic share the budget fairly rather than one power user exhausting the limit.

---

### `paymentLimiter`

- **Routes**: Payment intent creation and processing endpoints
- **Window / Max**: 1 min / 20 per clinic
- **Key**: `req.user.clinicId` (falls back to `req.ip`)
- **429 message**: `"Payment rate limit exceeded. Try again in 1 minute."`
- **Rationale**: Guards against duplicate payment submission and automated payment flooding.

---

### `generalLimiter`

- **Routes**: All `/api/v1/*` and `/api/v2/*` routes (applied globally at the router level)
- **Window / Max**: 15 min / 300 per IP
- **Key**: `req.ip`
- **429 message**: `"Too many requests. Try again in 15 minutes."`
- **Rationale**: Catch-all protection against automated scraping and API abuse. This limiter is applied in addition to any endpoint-specific limiter.

---

### `bulkExportLimiter`

- **Routes**: Bulk data export endpoints (e.g. `POST /api/v1/export/*`)
- **Window / Max**: 1 hour / 5 per user
- **Key**: `req.user.userId` (falls back to `req.ip`)
- **429 message**: `"Bulk export limit: 5 per hour. Try again later."`
- **Rationale**: Bulk exports generate large files and are I/O-intensive. Five exports per hour is sufficient for all legitimate use cases.

---

### `patientSearchLimiter`

- **Routes**: Patient search (`GET /api/v1/patients/search`)
- **Window / Max**: 1 min / 100 per user
- **Key**: `req.user.userId` (falls back to `req.ip`)
- **429 message**: `"Search rate limit exceeded. Try again in 1 minute."`
- **Rationale**: Prevents enumeration of the patient database and protects search index performance.

---

### `reportGenerationLimiter`

- **Routes**: Report generation endpoints
- **Window / Max**: 1 hour / 10 per user
- **Key**: `req.user.userId` (falls back to `req.ip`)
- **429 message**: `"Report generation limit: 10 per hour. Try again later."`
- **Rationale**: Report generation aggregates large datasets and is CPU-intensive. Ten per hour is generous for normal usage patterns.

---

## Storage Backend

### In-Memory (default — development / single instance)

When `REDIS_URL` is not set, the limiter uses an in-memory store. This works for single-instance deployments but **does not share state** across multiple API replicas. Multi-instance deployments without Redis are not protected against distributed brute-force attacks.

The following warning is logged at startup:

```
[rate-limit] REDIS_URL not configured. Using in-memory store.
Multi-instance deployments are NOT protected against distributed brute-force attacks.
Set REDIS_URL for production deployments.
```

### Redis (recommended — production / multi-instance)

Set the `REDIS_URL` environment variable to enable a shared Redis store across all API replicas. The Redis store implements a **sliding window** counter, so limits are enforced consistently across replicas without fixed-window boundary bursts:

```bash
# .env
REDIS_URL=redis://redis:6379
```

The Redis client connects on module load. If the Redis connection fails, the limiter **automatically falls back to in-memory** — requests are not blocked, avoiding Redis becoming a hard dependency. The fallback is logged as a warning:

```
[rate-limit] Falling back to in-memory store. Multi-instance deployments are NOT protected.
```

**Redis configuration example (docker-compose):**

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --save "" --appendonly no
```

### Proxy & Trust Configuration

When running behind NGINX or a load balancer, the API must be configured to trust the proxy so `req.ip` reflects the real client IP rather than the proxy IP. Without this, all requests appear to come from the proxy and share a single rate limit bucket.

In production (`NODE_ENV=production`) `trust proxy` is set to `1` automatically. For other environments, set the `TRUST_PROXY` environment variable:

```bash
# Trust one proxy hop (e.g. NGINX)
TRUST_PROXY=1

# Disable trust proxy (direct connections only)
TRUST_PROXY=false
```

---

## Bypass & Limit Increases

There is **no bypass token** mechanism. Rate limits apply uniformly to all clients, including API key holders and administrators.

### Working within the limits

- Implement exponential back-off when receiving `429`. Use the `Retry-After` response header to determine the exact wait time — do not guess or use a fixed delay.
- Cache responses where possible rather than making repeated identical requests.
- For AI and payment endpoints, batch operations where the API supports it (see the batch payment endpoint).
- Spread requests across the time window rather than bursting all requests at the start.

### Requesting a limit increase

For production workloads that legitimately require higher limits:

1. Contact the platform team with your use case, expected request volume, and business justification.
2. Limits are defined as constants in `apps/api/src/middlewares/rate-limit.middleware.ts` and require a code change and deployment.
3. Redis **must** be configured for increased limits to be effective in multi-instance environments; an in-memory store cannot reliably enforce higher limits across replicas.

---

## Metrics & Monitoring

Every time a limiter fires a `429` response, the `rate_limit_hits_total` Prometheus counter is incremented with the following labels:

| Label | Values |
|-------|--------|
| `limiter` | `auth`, `register`, `forgot-password`, `mfa`, `ai`, `payment`, `general`, `bulk-export`, `patient-search`, `report-generation` |
| `method` | HTTP method (`GET`, `POST`, etc.) |

Additional metrics:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `rate_limit_hits_total` | Counter | `limiter`, `method` | Incremented on every `429` response. |
| `rate_limit_requests_total` | Counter | `limiter`, `method`, `allowed` | Every request evaluated by a limiter; `allowed` is `true`/`false`. |
| `rate_limit_store_errors_total` | Counter | `limiter` | Redis errors encountered while evaluating a limiter (requests fail open). |

**Prometheus query — rate limit hits per limiter (last 5 min):**

```promql
sum by (limiter) (rate(rate_limit_hits_total[5m]))
```

**Prometheus query — rejection ratio per limiter:**

```promql
sum by (limiter) (rate(rate_limit_hits_total[5m]))
  /
sum by (limiter) (rate(rate_limit_requests_total[5m]))
```

**Alert on sustained login brute-forcing:**

```promql
rate(rate_limit_hits_total{limiter="auth"}[1m]) > 10
```

**Alert on Redis store errors:**

```promql
rate(rate_limit_store_errors_total[5m]) > 0
```

Alerts for sustained rate limiting are configured in the platform runbooks. Reach out to the on-call engineer if you observe unexpected spikes.

## Per-Resource Rate Limit Keys

Rate limits should combine user identity, tenant, route, and resource identifiers.

Examples:

- `tenant:{tenantId}:patient:{patientId}:read`
- `tenant:{tenantId}:auth:login`
- `tenant:{tenantId}:export:create`

Return `429` with retry metadata when limits are exceeded.
