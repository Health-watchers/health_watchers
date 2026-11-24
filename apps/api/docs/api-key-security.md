# API Key Management & Security

> Issue #1252 — API key generation and lifecycle management.

Health Watchers issues API keys for server-to-server integrations. Keys are
scoped, tenant-bound, rate-limited and fully auditable.

## Key format

```
hw_<64 hex chars>            # live key
hw_test_<64 hex chars>       # test-environment key
```

- Only the **SHA-256 hash** of a key is stored (`keyHash`, `select: false`).
- The raw key is returned exactly **once**, from `POST /api-keys` and
  `POST /api-keys/:id/rotate`. It is never recoverable afterwards.
- The stored `prefix` (`hw_xxxxxxxx`) is safe to display in dashboards and logs.

## Authentication

Send the key with the `ApiKey` scheme:

```
Authorization: ApiKey hw_1a2b3c...
```

`authenticateApiKey` (`src/middlewares/api-key.middleware.ts`):

1. hashes the presented key and looks it up by `keyHash` **or** `previousKeyHash`
2. rejects revoked (`revokedAt`), deactivated (`isActive: false`) and expired
   (`expiresAt < now`) keys with `401`
3. if matched on `previousKeyHash`, allows the request only while
   `previousKeyExpiresAt` is in the future and sets `X-Api-Key-Rotated: true`
4. attaches `req.apiKey` = `{ id, scopes, clinicId, environment, rateLimitPerMin, viaPreviousKey }`
5. records the call in the daily usage rollup (fire-and-forget)

Scope checks use `requireScope('patients:read')` after authentication.

## Lifecycle

| Action        | Endpoint                        | Effect |
|---------------|---------------------------------|--------|
| Create        | `POST /api-keys`                | new key, choose `scopes`, `environment`, `tags`, `rateLimitPerMin`, `expiresAt`/`expiresInDays` |
| List          | `GET /api-keys`                 | filter by `environment`, `tag`, `active`; each row carries a derived `status` and `inRotationGrace` |
| Update        | `PATCH /api-keys/:id`           | `name`, `description`, `scopes`, `tags`, `rateLimitPerMin`, `isActive` |
| Rotate        | `POST /api-keys/:id/rotate`     | new secret; old secret honoured for `gracePeriodHours` (default 24, max 168, `0` = immediate) |
| Revoke        | `DELETE /api-keys/:id`          | irreversible; sets `revokedAt`/`revokedReason`, clears any grace hash |
| Usage (raw)   | `GET /api-keys/:id/usage`       | last 30 daily rollup documents |
| Analytics     | `GET /api-keys/:id/analytics?days=30` | totals (`requests`, `rejected`, `errors`), `errorRate`, per-day series |

### Rotation & grace window

`rotate` copies the current `keyHash` into `previousKeyHash` (atomically, via an
aggregation-pipeline update) and stamps `previousKeyExpiresAt = now + grace`.
During the window **both** secrets authenticate; after it the
`api-key-lifecycle-job` unsets the previous hash. Rotating with
`gracePeriodHours: 0` invalidates the old secret immediately.

**A rotated key cannot be reused** — once the grace window closes the old hash
is gone and never matches again.

### Expiration

- `expiresAt` is enforced on every request (`401`) and by the hourly
  `api-key-lifecycle-job`, which also flips `isActive: false`.
- Seven days before expiry the job sends a one-time `system` notification to the
  key creator and stamps `expiryWarningSentAt`.

### Revocation

`DELETE /api-keys/:id` is **immediate** — the next request with that key gets
`401 "API key has been revoked"`. Revocation also clears the rotation grace hash
so a mid-rotation revoke closes both secrets at once.

## Rate limiting per key

`apiKeyRateLimit()` (`src/middlewares/api-key-rate-limit.middleware.ts`) enforces
`rateLimitPerMin` in a fixed 60-second window:

- counts live in Redis (`cache.incr`) so the limit holds across API instances;
  a process-local map is the fallback when Redis is down
- responses carry `X-RateLimit-Limit` / `-Remaining` / `-Reset`; a `429` adds
  `Retry-After` and increments the key's `rejectedCount`
- `rateLimitPerMin: 0` means "no per-key cap" — the global limiter still applies

## Audit logging

Every create / update / rotate / revoke writes an `AuditService` entry
(`API_KEY_CREATE`, `API_KEY_UPDATE`, `API_KEY_ROTATE`, `API_KEY_REVOKE`) with the
acting user, clinic, key id and a metadata summary (never the secret).

## Best practices for integrators

1. **Store keys in a secret manager**, never in source control or client code.
2. **Use `environment: "test"`** keys in non-production systems — they are visibly
   distinct (`hw_test_…`) and easy to filter/revoke in bulk.
3. **Request the narrowest scopes** the integration needs.
4. **Set an `expiresAt`** (or `expiresInDays`) so forgotten keys age out.
5. **Rotate on a schedule** (e.g. quarterly) using a non-zero grace window, then
   confirm traffic has moved off the old prefix via
   `GET /api-keys/:id/analytics` before it lapses.
6. **Set `rateLimitPerMin`** to a sane ceiling per integration so a runaway
   client cannot exhaust the tenant's global budget.
7. **Revoke immediately** on suspected compromise or when an integration is
   decommissioned — do not just let it expire.
8. **Alert on `errorRate`** from the analytics endpoint to catch broken
   integrations early.
