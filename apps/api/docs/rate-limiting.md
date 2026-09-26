# Rate Limiting

All rate limits are enforced per the table below. In production, limits are shared across all API instances via **Redis**. Without `REDIS_URL`, limits are per-process only — not suitable for multi-replica deployments.

---

## Limit Table

| Limiter | Endpoint(s) | Limit | Window | Key |
|---------|-------------|-------|--------|-----|
| `auth` | `POST /auth/login`, `/auth/register`, `/auth/*` | 5 req | 15 min | IP |
| `forgot-password` | `POST /auth/forgot-password` | 3 req | 1 hour | IP |
| `general` | All other `/api/v1/*` and `/api/v2/*` routes | 300 req | 15 min | IP |
| `ai` | `POST /ai/*` | 20 req | 1 min | Clinic ID |
| `payment` | `POST /payments/*`, `/pre-auth/*` | 20 req | 1 min | Clinic ID |
| `bulk-export` | `GET /exports/*` | 5 req | 1 hour | User ID |
| `patient-search` | `GET /patients/search` | 100 req | 1 min | User ID |
| `report-generation` | `POST /reports` | 10 req | 1 hour | User ID |

---

## Response Headers

Every response from a rate-limited endpoint includes standard RateLimit headers:

```http
RateLimit-Limit: 300
RateLimit-Remaining: 247
RateLimit-Reset: 1700001000
```

When the limit is exceeded, the response is `HTTP 429` and includes `Retry-After`:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 900
Content-Type: application/json

{
  "error": "TooManyRequests",
  "message": "Too many requests. Try again in 15 minutes."
}
```

---

## Key Strategies

- **IP-keyed** (`auth`, `forgot-password`, `general`): based on `req.ip`. When running behind NGINX or a load balancer, set `TRUST_PROXY=1` so the real client IP is used instead of the proxy IP.
- **Clinic-keyed** (`ai`, `payment`): based on `req.user.clinicId` from the JWT. This means all staff at the same clinic share the quota.
- **User-keyed** (`bulk-export`, `patient-search`, `report-generation`): based on `req.user.userId`.

---

## Per-Tier Limits (Advanced)

Premium and Enterprise subscribers have elevated limits managed by the advanced rate-limiting service. The tier is resolved from the clinic's active subscription:

| Tier | General limit | AI limit | Payment limit |
|------|--------------|----------|---------------|
| `free` | 100 / 15 min | 5 / min | 5 / min |
| `basic` | 300 / 15 min | 20 / min | 20 / min |
| `premium` | 1000 / 15 min | 60 / min | 60 / min |

---

## Redis Configuration

```env
# Required for distributed (multi-replica) rate limiting
REDIS_URL=redis://localhost:6379
```

Without `REDIS_URL`:
- Limits reset on pod restart
- Each replica tracks counts independently — effectively multiplying the allowed request rate by the replica count
- A `WARN` log is emitted at startup

---

## Handling 429 in Client Code

```javascript
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
    console.warn(`Rate limited. Retrying in ${retryAfter}s`);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return apiFetch(url, options); // single retry
  }

  return res;
}
```

For high-throughput integrations, implement **exponential back-off** with jitter instead of a fixed retry delay.

---

## Prometheus Metric

The API exposes a `rate_limit_hits_total` counter labelled by `limiter` and `method`:

```
rate_limit_hits_total{limiter="auth",method="POST"} 12
rate_limit_hits_total{limiter="general",method="GET"} 3
```

Scrape at `GET /metrics` (internal; not exposed publicly).
