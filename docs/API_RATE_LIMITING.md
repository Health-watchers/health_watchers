# API Rate Limiting Documentation

Health Watchers uses [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) with an optional Redis backend. All limiters return standard IETF rate-limit headers and a consistent `429` error body.

---

## Rate Limit Summary

| Limiter | Window | Max Requests | Key | Scope |
|---------|--------|-------------|-----|-------|
| `authLimiter` | 15 minutes | 5 | IP address | `POST /auth/login` |
| `forgotPasswordLimiter` | 1 hour | 3 | IP address | `POST /auth/forgot-password` |
| `aiLimiter` | 1 minute | 20 | `clinicId` (fallback: IP) | `/ai/*` endpoints |
| `paymentLimiter` | 1 minute | 20 | `clinicId` (fallback: IP) | Payment endpoints |
| `generalLimiter` | 15 minutes | 300 | IP address | All routes (global) |
| `bulkExportLimiter` | 1 hour | 5 | `userId` (fallback: IP) | Bulk export |
| `patientSearchLimiter` | 1 minute | 100 | `userId` (fallback: IP) | Patient search |
| `reportGenerationLimiter` | 1 hour | 10 | `userId` (fallback: IP) | Report generation |

---

## Response Headers

Every response from a rate-limited endpoint includes these headers:

| Header | Description |
|--------|-------------|
| `RateLimit-Limit` | Maximum requests allowed in the window |
| `RateLimit-Remaining` | Requests remaining in the current window |
| `RateLimit-Reset` | UTC epoch seconds when the window resets |
| `Retry-After` | Seconds to wait before retrying (only on `429` responses) |

Legacy `X-RateLimit-*` headers are **disabled**.

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

The `error` field is always `"TooManyRequests"`. The `message` field is human-readable and specific to the endpoint (see [Limiter Details](#limiter-details) below).

---

## Examples

### Login — 5 requests per 15 minutes per IP

```bash
# First 5 requests succeed
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://api.example.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}'
# → 200 or 401

# 6th request within 15 minutes
# → 429
```

### AI endpoint — 20 requests per minute per clinic

```bash
curl -s -X POST https://api.example.com/ai/summarize \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"patientId":"..."}'
# → 200 while under 20/min for your clinic
# → 429 after 20th request with Retry-After: 60
```

### Patient search — 100 requests per minute per user

```bash
curl -s "https://api.example.com/patients/search?q=smith" \
  -H "Authorization: Bearer <jwt>"
# → 200 for first 100 requests in the minute window
# → 429 on the 101st
```

### General API — 300 requests per 15 minutes per IP

```bash
curl -s https://api.example.com/patients \
  -H "Authorization: Bearer <jwt>"
# Headers on a healthy response:
# RateLimit-Limit: 300
# RateLimit-Remaining: 299
# RateLimit-Reset: 1719489600
```

---

## Limiter Details

### `authLimiter`
- **Route**: `POST /auth/login`
- **Window / Max**: 15 min / 5 per IP
- **429 message**: `"Too many login attempts. Try again in 15 minutes."`
- **Rationale**: Brute-force protection on the login endpoint.

### `forgotPasswordLimiter`
- **Route**: `POST /auth/forgot-password`
- **Window / Max**: 1 hour / 3 per IP
- **429 message**: `"Too many password reset requests. Try again in 1 hour."`
- **Rationale**: Prevents password-reset enumeration attacks.

### `aiLimiter`
- **Routes**: `/ai/*` (summaries, risk scores, drug interactions, etc.)
- **Window / Max**: 1 min / 20 per clinic
- **Key**: `req.user.clinicId` from JWT (falls back to IP for unauthenticated requests)
- **429 message**: `"AI rate limit exceeded. Try again in 1 minute."`
- **Rationale**: AI calls are expensive; limit is per clinic to be fair across users.

### `paymentLimiter`
- **Routes**: Payment intent / processing endpoints
- **Window / Max**: 1 min / 20 per clinic
- **Key**: `req.user.clinicId`
- **429 message**: `"Payment rate limit exceeded. Try again in 1 minute."`

### `generalLimiter`
- **Routes**: All API routes (applied globally)
- **Window / Max**: 15 min / 300 per IP
- **429 message**: `"Too many requests. Try again in 15 minutes."`
- **Rationale**: Catch-all protection against automated scraping.

### `bulkExportLimiter`
- **Routes**: Bulk data export endpoints
- **Window / Max**: 1 hour / 5 per user
- **Key**: `req.user.userId`
- **429 message**: `"Bulk export limit: 5 per hour. Try again later."`
- **Rationale**: Bulk exports are I/O intensive; 5/hr is sufficient for legitimate use.

### `patientSearchLimiter`
- **Routes**: Patient search
- **Window / Max**: 1 min / 100 per user
- **Key**: `req.user.userId`
- **429 message**: `"Search rate limit exceeded. Try again in 1 minute."`

### `reportGenerationLimiter`
- **Routes**: Report generation
- **Window / Max**: 1 hour / 10 per user
- **Key**: `req.user.userId`
- **429 message**: `"Report generation limit: 10 per hour. Try again later."`

---

## Storage Backend

### In-Memory (default — development / single instance)

When `REDIS_URL` is not set, the limiter uses an in-memory store. This works for single-instance deployments but **does not share state** across multiple API replicas. Multi-instance deployments without Redis are not protected against distributed brute-force attacks.

A warning is logged at startup:

```
[rate-limit] REDIS_URL not configured. Using in-memory store.
Multi-instance deployments are NOT protected against distributed brute-force attacks.
```

### Redis (recommended — production / multi-instance)

Set the `REDIS_URL` environment variable to enable a shared Redis store:

```bash
REDIS_URL=redis://redis:6379
```

The Redis client connects on startup. If the connection fails, the limiter logs an error and falls back to in-memory automatically — requests are **not** blocked, avoiding a hard dependency.

```bash
# .env.example
REDIS_URL=redis://localhost:6379
```

---

## Bypass & Limit Increases

There is **no bypass token** mechanism. Rate limits apply uniformly to all clients including API key holders.

**To work within the limits:**

- Implement exponential back-off when you receive `429`. Use the `Retry-After` header to determine the exact wait time.
- Cache responses where possible rather than making repeated identical requests.
- For AI and payment endpoints, batch operations where the API supports it (batch payment endpoint is available).

**To request a limit increase:**

- For production workloads requiring higher limits, contact the platform team.
- Limits are constants in `apps/api/src/middlewares/rate-limit.middleware.ts` and require a code change + deployment.
- Redis must be configured for limit increases to be effective in multi-instance environments.

**Handling `429` in client code:**

```typescript
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;

    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
  }
  throw new Error('Rate limit exceeded after retries');
}
```
