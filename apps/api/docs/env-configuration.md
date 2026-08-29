# Environment Configuration Guide

`apps/api/src/config/env.ts` validates every environment variable at process
start using [Zod](https://zod.dev). A malformed or missing required value
prints a formatted error table and exits with code `1` before any other module
loads.

---

## How It Works

```
process start
    │
    ├─► import './config/env'   ← must be the first import in app.ts
    │       │
    │       ├─► zod.safeParse(process.env)
    │       │       ├─ success → export env, run runtime checks
    │       │       └─ failure → print table, process.exit(1)
    │       │
    │       └─► runtime HIPAA checks (production only)
    │               ├─ FIELD_ENCRYPTION_KEY missing  → process.exit(1)
    │               ├─ AUDIT_ENCRYPTION_KEY missing  → warn
    │               ├─ BACKUP_ENCRYPTION_KEY missing → warn
    │               ├─ SMTP_HOST missing             → warn
    │               └─ REDIS_URL missing             → warn
    │
    └─► rest of application boots
```

---

## Variable Reference

### Core Server

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGO_URI` | ✅ Yes | — | MongoDB connection string |
| `API_PORT` | No | `3001` | HTTP port the API listens on |
| `NODE_ENV` | No | — | `development` / `production` / `test` |
| `TRUST_PROXY` | No | — | Express `trust proxy` setting. Set to `1` when behind NGINX/load-balancer |
| `WEB_URL` | No | `http://localhost:3000` | Frontend URL used by Socket.IO CORS |
| `LOG_LEVEL` | No | `info` | Pino log level: `debug` / `info` / `warn` / `error` |
| `SENTRY_DSN` | No | — | Sentry error-tracking DSN (must be a valid URL when set) |

### Authentication / JWT

| Variable | Required | Min Length | Description |
|---|---|---|---|
| `JWT_ACCESS_TOKEN_SECRET` | ✅ Yes | 32 chars | Signs short-lived access tokens (15 min TTL) |
| `JWT_REFRESH_TOKEN_SECRET` | ✅ Yes | 32 chars | Signs long-lived refresh tokens (7 day TTL) |

> **Rotation:** Rotate both secrets monthly. Rotating invalidates all active
> sessions — users will be signed out. Deploy the new secret, then remove the
> old one.

### Redis

| Variable | Required | Description |
|---|---|---|
| `REDIS_URL` | No (⚠ prod) | `redis://host:port` — required in production for distributed rate-limiting |

Missing in production: rate limiting falls back to in-memory, which allows
brute-force bypass across multiple API pods.

### Stellar / Blockchain

| Variable | Required | Default | Description |
|---|---|---|---|
| `STELLAR_NETWORK` | No | `testnet` | `testnet` or `mainnet` |
| `GEMINI_API_KEY` | No | — | Gemini AI key for AI features |

---

## HIPAA Security Variables

These variables implement controls required under the HIPAA Security Rule
(45 CFR Part 164). Each section references the specific regulatory citation.

### PHI Field-Level Encryption — § 164.312(a)(2)(iv)

| Variable | Required | Format | Description |
|---|---|---|---|
| `FIELD_ENCRYPTION_KEY` | ✅ **Prod required** | 64-char hex | AES-256-GCM key that encrypts PHI fields (DOB, phone, address, insurance numbers) in MongoDB |
| `FIELD_ENCRYPTION_KEY_VERSION` | No | Integer string | Version number of the active key. Default: `1` |
| `FIELD_ENCRYPTION_KEY_V<n>` | During rotation | 64-char hex | Old key kept during rotation (e.g. `FIELD_ENCRYPTION_KEY_V1`) |

**Generate a new key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Key rotation procedure:**
1. Generate a new 64-char hex key.
2. Increment `FIELD_ENCRYPTION_KEY_VERSION` (e.g. `1` → `2`).
3. Move the old key to `FIELD_ENCRYPTION_KEY_V1` (the old version number).
4. Set `FIELD_ENCRYPTION_KEY` to the new key.
5. Deploy. The API now encrypts new writes with the new key and can still
   decrypt old records using the versioned key.
6. Run the re-encryption migration to re-encrypt all existing PHI fields.
7. Remove `FIELD_ENCRYPTION_KEY_V1` once migration is confirmed complete.

**What is encrypted:** `contactNumber`, `address`, `dateOfBirth`,
`insurance[].policyNumber`, `insurance[].groupNumber` on the `Patient`
model. Encryption/decryption is transparent — the application always
works with plaintext values; only the persisted bytes are ciphertext.

### Audit Log Encryption — § 164.312(b)

| Variable | Required | Format | Description |
|---|---|---|---|
| `AUDIT_ENCRYPTION_KEY` | No (⚠ prod warn) | 64-char hex | AES-256-GCM key for encrypting sensitive metadata in audit log entries |

Missing in production triggers a startup warning but does not block boot.
Full § 164.312(b) compliance requires this key to be set.

### Backup Encryption — § 164.312(c)(1)

| Variable | Required | Min Length | Description |
|---|---|---|---|
| `BACKUP_ENCRYPTION_KEY` | No (⚠ prod warn) | 32 chars | AES-256 passphrase for encrypting MongoDB backups stored in S3 |
| `BACKUP_BUCKET` | No | — | S3 bucket name for encrypted backups |
| `BACKUP_RETENTION_DAYS` | No | — | Days to retain backups (default: 30) |

**Generate:**
```bash
openssl rand -base64 32
```

### SMTP — Breach Notification Emails — § 164.410

| Variable | Required | Description |
|---|---|---|
| `SMTP_HOST` | No (⚠ prod warn) | SMTP server hostname |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_SECURE` | No | `true` for port 465 TLS, `false` for STARTTLS |
| `SMTP_USER` | No | SMTP authentication username |
| `SMTP_PASS` | No | SMTP authentication password |
| `SMTP_FROM` | No | From address for outgoing emails |
| `APP_BASE_URL` | No | Base URL included in notification email links |

Missing `SMTP_HOST` in production triggers a startup warning. Breach
notification emails (required within 60 days under § 164.410) will not be
sent automatically without SMTP configured.

### Data Retention — § 164.530(j)

| Variable | Default | Description |
|---|---|---|
| `CLINICAL_RETENTION_YEARS` | `7` | Minimum years to retain clinical records. HIPAA minimum is 6; many states require 7–10 |
| `AUDIT_LOG_RETENTION_YEARS` | `6` | Years to retain audit logs. HIPAA minimum is 6 years from creation or last effective date |

### Security Awareness Training — § 164.308(a)(5)

| Variable | Default | Description |
|---|---|---|
| `SECURITY_TRAINING_EXPIRY_DAYS` | `365` | Days before a staff member's security training record expires and re-training is required |

---

## Runtime Startup Checks (Production Only)

When `NODE_ENV=production` the following checks run after schema validation:

| Check | Severity | Behavior |
|---|---|---|
| `FIELD_ENCRYPTION_KEY` absent | 🚨 Fatal | `process.exit(1)` — PHI would be stored in plaintext |
| `AUDIT_ENCRYPTION_KEY` absent | ⚠️ Warning | Logs warning, continues boot |
| `BACKUP_ENCRYPTION_KEY` absent | ⚠️ Warning | Logs warning, continues boot |
| `SMTP_HOST` absent | ⚠️ Warning | Logs warning, continues boot |
| `REDIS_URL` absent | ⚠️ Warning | Logs warning, falls back to in-memory rate limiting |

---

## Startup Output

A successful boot prints:

```
✅ Config validated:
   API_PORT:                    3001
   MONGO_URI:                   mongodb://***@host:27017/db
   STELLAR_NETWORK:             testnet
   LOG_LEVEL:                   info
   HIPAA FIELD_ENCRYPTION_KEY:  ✅ set
   HIPAA AUDIT_ENCRYPTION_KEY:  ✅ set
   HIPAA BACKUP_ENCRYPTION_KEY: ✅ set
   HIPAA SMTP_HOST:             ✅ set
```

A failed boot (missing required variable) prints and exits:

```
❌ Environment validation failed:

+---------------------------+----------------------------------------------+
| Variable                  | Issue                                        |
+---------------------------+----------------------------------------------+
| JWT_ACCESS_TOKEN_SECRET   | JWT_ACCESS_TOKEN_SECRET must be at least 32  |
+---------------------------+----------------------------------------------+
```

---

## Local Development Setup

Copy `.env.example` to `.env` and fill in values. The `.env` file is
git-ignored — never commit it.

```bash
cp .env.example .env
```

Minimum variables needed to start locally:

```dotenv
MONGO_URI=mongodb://localhost:27017/health_watchers
JWT_ACCESS_TOKEN_SECRET=dev-access-secret-change-in-production-min32
JWT_REFRESH_TOKEN_SECRET=dev-refresh-secret-change-in-production-min32
# Generate for local dev (not required but avoids the startup warning):
FIELD_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000001
```

> **Never use placeholder keys in production.** Generate real random keys with
> the commands above.

---

## Adding a New Variable

1. Add the field to `envSchema` in `env.ts` with an appropriate Zod validator.
2. Export it from `env` or access it via `process.env` directly (prefer `env.*`
   for validated, typed access).
3. Add a production check if the variable is security-sensitive.
4. Add an entry to `.env.example` with a safe placeholder and a comment.
5. Document it in this file under the appropriate section.
