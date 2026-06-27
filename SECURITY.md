## CSRF Protection

Health Watchers uses the **double-submit cookie** pattern to protect state-changing API endpoints.

### How It Works

1. On the first request to the API, the server sets a non-HttpOnly cookie `csrf-token` containing a random 32-byte hex token.
2. The frontend JavaScript reads this cookie and includes its value in the `X-CSRF-Token` request header on all `POST`, `PUT`, `PATCH`, and `DELETE` requests.
3. The `csrfMiddleware` in `apps/api/src/middlewares/csrf.middleware.ts` validates that the header value matches the cookie value. A mismatch results in a `403 Forbidden` response.

### Why This Works

Cross-origin requests from a malicious site cannot read the `csrf-token` cookie value (blocked by the Same-Origin Policy), so they cannot forge the required header.

### Exceptions

- `GET`, `HEAD`, and `OPTIONS` requests are exempt (read-only).
- `/api/v1/auth/login` and `/api/v1/auth/register` are exempt (no session exists yet).

### Cookie Security

| Cookie | HttpOnly | Secure (prod) | SameSite |
|--------|----------|---------------|----------|
| `csrf-token` | ❌ (must be JS-readable) | ✅ | Strict |
| `accessToken` (web) | ❌ (Next.js middleware reads it) | Recommended | Strict |
