# Environment Configuration

This document covers every environment variable validated by `apps/api/src/config/env.ts`, the security rationale behind each one, known issues, and the runbook for rotating secrets.

## Table of Contents

- [How validation works](#how-validation-works)
- [Variable reference](#variable-reference)
  - [Core server](#core-server)
  - [Database](#database)
  - [JWT secrets](#jwt-secrets)
  - [PHI encryption (HIPAA)](#phi-encryption-hipaa)
  - [Redis](#redis)
  - [SMTP / email](#smtp--email)
  - [Backup encryption](#backup-encryption)
  - [Observability](#observability)
  - [Miscellaneous](#miscellaneous)
- [Known issues](#known-issues)
- [Production checklist](#production-checklist)
- [Secret rotation runbook](#secret-rotation-runbook)

---

## How validation works

`env.ts` must be the **second** import in `app.ts` (after tracing/Sentry instrumentation). It uses [Zod](https://zod.dev/) to parse `process.env` at startup. On any failure it prints a formatted table of every broken variable and exits with code `1` — the server never starts with a bad config.

```
❌ Environment validation failed:

+---------------------------+--------------------------------------------------+
| Variable                  | Issue                                            |
+---------------------------+--------------------------------------------------+
| JWT_ACCESS_TOKEN_SECRET   | JWT_ACCESS_TOKEN_SECRET must be at least 32 chars|
+---------------------------+--------------------------------------------------+
```

HIPAA-critical variables (`FIELD_ENCRYPTION_KEY`, `REDIS_URL`) also trigger a hard exit in production if missing. Non-critical HIPAA variables (`AUDIT_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`, `SMTP_HOST`) emit a `console.warn` so the service can still start while alerting the operator.

---

## Variable reference

### Core server

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | — | `development` \| `production` \| `test`. Controls stack-trace leakage, HTTPS-only cookies, and HIPAA hard-exits. |
| `API_PORT` | No | `3001` | TCP port the Express server binds to. |
| `WEB_URL` | No | `http://localhost:3000` | Frontend origin — used for Socket.IO CORS and email links. In production set to the canonical HTTPS URL. |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | Comma-separated list of origins allowed by the REST API CORS policy. |
| `TRUST_PROXY` | No | `1` in prod | Hop count passed to `app.set('trust proxy', …)`. Set to `false` for direct connections, or to the actual proxy hop count so `req.ip` reflects the real client IP for rate limiting. |
| `MAX_REQUEST_BODY_SIZE` | No | `10kb` | Hard cap on JSON / form body size. Raise only for specific routes (AI routes use a separate `AI_REQUEST_BODY_SIZE`). |

### Database

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGO_URI` | **Yes** | — | Full MongoDB connection string including credentials. Printed at startup with credentials redacted. Rotate quarterly. |
| `MONGO_MAX_POOL_SIZE` | No | `10` | Maximum connections in the Mongoose connection pool. |

### JWT secrets

All three secrets must be cryptographically independent — do **not** reuse values across them.

| Variable | Required | Min length | Description |
|---|---|---|---|
| `JWT_ACCESS_TOKEN_SECRET` | **Yes** | 32 chars | Signs 15-minute access tokens. Rotating this secret immediately invalidates all active sessions. |
| `JWT_REFRESH_TOKEN_SECRET` | **Yes** | 32 chars | Signs 7-day refresh tokens. Rotation invalidates all refresh tokens; users must log in again. |
| `JWT_TEMP_TOKEN_SECRET` | **Yes** | 32 chars | Signs 5-minute MFA challenge tokens issued during the login → MFA step. See [known issues](#known-issues). |
| `JWT_ISSUER` | No | — | `iss` claim value. Must match `config.jwt.issuer`. Default: `health-watchers-api`. |
| `JWT_AUDIENCE` | No | — | `aud` claim value. Must match `config.jwt.audience`. Default: `health-watchers-client`. |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### PHI encryption (HIPAA)

HIPAA Security Rule § 164.312(a)(2)(iv) requires encryption of PHI at rest. These keys protect field-level encryption of sensitive patient data stored in MongoDB.

| Variable | Required in prod | Format | Description |
|---|---|---|---|
| `FIELD_ENCRYPTION_KEY` | **Yes** (hard exit) | 64-char hex (32 bytes) | AES-256 key for encrypting PHI fields (SSN, DOB, contact details). Missing in production causes immediate process exit. |
| `FIELD_ENCRYPTION_KEY_VERSION` | No | string | Version identifier for the active key. Used during key rotation to route decryption to the correct key version. |
| `AUDIT_ENCRYPTION_KEY` | No (warn) | 64-char hex (32 bytes) | AES-256 key for encrypting audit log entries at rest (§ 164.312(b)). |

Generate a 64-char hex key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Redis

| Variable | Required in prod | Description |
|---|---|---|
| `REDIS_URL` | **Yes** (hard exit) | Full Redis connection URL (`redis://` or `rediss://`). Used for: distributed rate limiting, JWT denylist, response cache. **Missing in production causes a hard exit** because without Redis, rate limiting is per-pod — attackers can bypass brute-force protection by distributing login attempts across replicas. |

### SMTP / email

Required for HIPAA § 164.410 breach notifications and password-reset emails.

| Variable | Required | Description |
|---|---|---|
| `SMTP_HOST` | No (warn in prod) | SMTP server hostname. Missing in production emits a HIPAA warning. |
| `SMTP_PORT` | No | SMTP port. Typically `587` (STARTTLS) or `465` (TLS). |
| `SMTP_SECURE` | No | `"true"` to use implicit TLS (port 465). `"false"` for STARTTLS. |
| `SMTP_USER` | No | SMTP auth username. |
| `SMTP_PASS` | No | SMTP auth password. Keep in a secret manager; never commit. |
| `SMTP_FROM` | No | From address for outbound mail (e.g. `no-reply@health-watchers.app`). |
| `APP_BASE_URL` | No | Base URL inserted into email links (password reset, verification). |

### Backup encryption

HIPAA § 164.312(c)(1) requires integrity controls on stored data, including backups.

| Variable | Required in prod | Description |
|---|---|---|
| `BACKUP_ENCRYPTION_KEY` | No (warn) | AES-256 passphrase (min 32 chars) for encrypting MongoDB backup archives before upload to S3. Missing in production emits a HIPAA warning. |
| `BACKUP_BUCKET` | No | S3 bucket name for backup storage. |
| `BACKUP_RETENTION_DAYS` | No | Number of days to retain backups before automatic deletion. Default: `30`. |

### Observability

| Variable | Required | Description |
|---|---|---|
| `SENTRY_DSN` | No | Sentry ingest URL. Unhandled exceptions and performance traces are forwarded here. Must be a valid URL if set. |
| `LOG_LEVEL` | No | `debug` \| `info` \| `warn` \| `error`. Default: `info`. In production use `warn` or `error` to avoid logging PHI in verbose levels. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | OpenTelemetry collector endpoint. Leave blank to disable OTLP export. |
| `OTEL_SAMPLING_RATE` | No | Fraction of requests to trace (0.0–1.0). Default: `1.0` dev, `0.1` prod. |
| `METRICS_USERNAME` | No | HTTP Basic Auth username for the `GET /metrics` Prometheus endpoint. |
| `METRICS_PASSWORD` | No | HTTP Basic Auth password for the `GET /metrics` endpoint. Change from default in production. |
| `METRICS_ALLOWED_IPS` | No | Comma-separated IP allowlist for the `/metrics` endpoint (alternative to basic auth). |

### Miscellaneous

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | No | Google Gemini API key for AI-assisted clinical summarisation. |
| `STELLAR_NETWORK` | No | `testnet` \| `mainnet`. Default: `testnet`. |
| `STELLAR_SECRET_KEY` | No | Server-side Stellar signing key. Never expose to clients. |
| `STELLAR_SERVICE_SECRET` | No | Shared secret between `api` and `stellar-service` for inter-service authentication. |
| `INSURANCE_WEBHOOK_SECRET` | No | HMAC secret for verifying inbound insurance reimbursement webhook signatures. |
| `CLINICAL_RETENTION_YEARS` | No | Clinical record retention period in years. HIPAA minimum: 6. Default: `7`. |
| `AUDIT_LOG_RETENTION_YEARS` | No | Audit log retention in years. HIPAA minimum: 6. Default: `6`. |
| `SECURITY_TRAINING_EXPIRY_DAYS` | No | Days before a user's annual security training record expires. Default: `365`. |

---

## Known issues

### `JWT_TEMP_TOKEN_SECRET` not validated at startup

**Severity:** High — OWASP A02 (Cryptographic Failures) / A07 (Identification and Authentication Failures)

**Status:** Open

**File:** `apps/api/src/config/env.ts`

**Description:**

`JWT_TEMP_TOKEN_SECRET` is read directly from `process.env` inside `token.service.ts` via `config.jwt.tempTokenSecret` but is **not declared in the Zod schema** in `env.ts`. This means:

1. The server starts successfully even when the variable is missing.
2. `signTempToken()` and `verifyTempToken()` will use `undefined` as the signing secret, which `jsonwebtoken` accepts — it signs with an empty key and any token passes verification.
3. An attacker who knows the key is absent can forge a MFA challenge token, bypass the TOTP step, and obtain a fully-authenticated session without knowing the user's password.

**Affected code paths:**

- `apps/api/src/modules/auth/token.service.ts` — `signTempToken()`, `verifyTempToken()`
- `apps/api/src/modules/auth/auth.controller.ts` — `/auth/login` MFA branch, `/auth/mfa/challenge`

**Fix:**

Add `JWT_TEMP_TOKEN_SECRET` to the Zod schema in `env.ts` with the same minimum-length constraint as the other JWT secrets:

```typescript
// apps/api/src/config/env.ts
JWT_TEMP_TOKEN_SECRET: z
  .string({ required_error: 'Missing required env var: JWT_TEMP_TOKEN_SECRET' })
  .min(32, 'JWT_TEMP_TOKEN_SECRET must be at least 32 characters (too weak)'),
```

Also add it to `.env.example` (already documented there but not validated) and verify that `@health-watchers/config` exposes it through `config.jwt.tempTokenSecret` with the typed value rather than an optional.

**Workaround until fixed:**

Ensure `JWT_TEMP_TOKEN_SECRET` is always set in every deployment environment. The `.env.example` already includes it — confirm it is present in all staging and production secret stores.

---

### `REDIS_URL` only warns in production — does not hard-exit

**Severity:** Medium — OWASP A07 (Identification and Authentication Failures)

**Status:** Open

**File:** `apps/api/src/config/env.ts`

**Description:**

When `REDIS_URL` is absent in production, `env.ts` logs a warning but allows the server to continue. Without Redis:

- Rate limiting is in-memory and **per-pod** — a distributed brute-force attack across multiple pods bypasses the 5-attempt lockout entirely.
- The JWT denylist falls back to in-memory — logged-out tokens may remain valid across a pod restart.
- The response cache is disabled — higher DB load under attack.

**Fix:**

Promote the production Redis check from a warning to a hard exit, consistent with how `FIELD_ENCRYPTION_KEY` is handled:

```typescript
// apps/api/src/config/env.ts
if (isProd && !env.REDIS_URL) {
  console.error(
    '🚨 SECURITY: REDIS_URL is not set in production. ' +
      'Distributed rate limiting and JWT denylist are non-functional. ' +
      'Set REDIS_URL to a Redis instance before deploying.'
  );
  process.exit(1);
}
```

---

### `LOCK_DURATION_MS` inconsistency between `auth.controller.ts` and `constants.ts`

**Severity:** Low

**Status:** Open

**Files:**
- `apps/api/src/modules/auth/auth.controller.ts` — defines `LOCK_DURATION_MS = 15 * 60 * 1000` (15 minutes)
- `apps/api/src/constants.ts` — defines `AUTH.LOCKOUT_DURATION_MS = 30 * 60 * 1000` (30 minutes)

**Description:**

Two sources of truth for account lockout duration. The controller uses the local constant (15 min), silently ignoring the shared constant. This means the actual lockout is half the documented policy.

**Fix:**

Remove the local constant from `auth.controller.ts` and import from `constants.ts`:

```typescript
// auth.controller.ts — remove local definition
// const LOCK_DURATION_MS = 15 * 60 * 1000;  ← delete

import { AUTH } from '@api/constants';
// then use AUTH.LOCKOUT_DURATION_MS everywhere
```

---

## Production checklist

Run through this before every production deployment.

```
[ ] JWT_ACCESS_TOKEN_SECRET   — set, ≥ 32 chars, unique, not default
[ ] JWT_REFRESH_TOKEN_SECRET  — set, ≥ 32 chars, unique, not default
[ ] JWT_TEMP_TOKEN_SECRET     — set, ≥ 32 chars, unique, not default  ← see known issue
[ ] MONGO_URI                 — set, credentials not committed to git
[ ] REDIS_URL                 — set, TLS URL (rediss://) in production
[ ] FIELD_ENCRYPTION_KEY      — set, 64-char hex, stored in secret manager
[ ] AUDIT_ENCRYPTION_KEY      — set, 64-char hex, stored in secret manager
[ ] BACKUP_ENCRYPTION_KEY     — set, ≥ 32 chars, stored in secret manager
[ ] SMTP_HOST / SMTP_PASS     — configured and tested
[ ] NODE_ENV=production       — explicitly set
[ ] ALLOWED_ORIGINS           — lists only production domains (no localhost)
[ ] WEB_URL                   — production HTTPS URL
[ ] SENTRY_DSN                — configured so errors are captured
[ ] METRICS_PASSWORD          — changed from default
```

---

## Secret rotation runbook

### JWT secrets

1. Generate three new secrets (access, refresh, temp) with `crypto.randomBytes(32).toString('hex')`.
2. Update the secret manager / environment before deploying.
3. Deploy the new build — all existing tokens are immediately invalid.
4. Users will be logged out and prompted to re-authenticate. Coordinate with product for off-peak rotation.

### `FIELD_ENCRYPTION_KEY`

Field-level encryption uses a versioned key scheme. **Do not simply replace the key** — old records cannot be decrypted.

1. Generate a new key and store it as `FIELD_ENCRYPTION_KEY_V<n>` where `n` is the next version number.
2. Set `FIELD_ENCRYPTION_KEY` to the new key and `FIELD_ENCRYPTION_KEY_VERSION` to `<n>`.
3. Run the key-rotation migration script (see `apps/api/scripts/rotate-encryption-key.ts`) to re-encrypt all PHI fields.
4. Remove the old key from the environment only after the migration completes and is verified.

### `MONGO_URI` credentials

1. Rotate the MongoDB user password in the database.
2. Update `MONGO_URI` in the secret manager.
3. Perform a rolling restart so pods pick up the new URI without downtime.

### `BACKUP_ENCRYPTION_KEY`

1. Generate a new key.
2. Update the secret manager.
3. Old backup archives remain decryptable with the previous key — retain it until all backups under the old key have expired per `BACKUP_RETENTION_DAYS`.

---

## Related files

| File | Purpose |
|---|---|
| `apps/api/src/config/env.ts` | Zod schema — source of truth for all validated variables |
| `apps/api/src/config/config.service.ts` | Typed config accessor used throughout the app |
| `.env.example` | Template with all variables documented — copy to `.env` locally |
| `apps/api/src/modules/auth/token.service.ts` | Consumes `JWT_*` secrets via config |
| `apps/api/src/middlewares/rate-limit.middleware.ts` | Consumes `REDIS_URL` for distributed rate limiting |
| `apps/api/src/lib/encrypt.ts` | Consumes `FIELD_ENCRYPTION_KEY` for PHI field encryption |
| `apps/api/src/modules/audit/audit.service.ts` | Consumes `AUDIT_ENCRYPTION_KEY` |
