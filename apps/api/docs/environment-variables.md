# Environment Variables Reference

This document describes every environment variable accepted by the API service.
Variables are validated at startup by `src/config/env.ts` using [Zod](https://zod.dev/).
A missing or malformed **required** variable causes the process to exit with code 1
before handling any requests.

> **Never commit `.env` to git.** Copy `.env.example` to `.env` and fill in real values.

---

## Quick-start

```bash
cp .env.example .env
# edit .env with your local values
npm run dev
```

A startup summary is printed to stdout on every boot:

```
✅ Config validated:
   API_PORT:        3001
   MONGO_URI:       mongodb://***@localhost:27017/health_watchers
   STELLAR_NETWORK: testnet
   LOG_LEVEL:       info
   HIPAA FIELD_ENCRYPTION_KEY:  ✅ set
   HIPAA AUDIT_ENCRYPTION_KEY:  ⚠️  NOT SET
   HIPAA BACKUP_ENCRYPTION_KEY: ⚠️  NOT SET
   HIPAA SMTP_HOST:             ⚠️  NOT SET
```

Any `⚠️ NOT SET` line in production triggers an additional warning or hard exit (see HIPAA section below).

---

## Variable Reference

### Server

| Variable | Required | Default | Description |
|---|---|---|---|
| `API_PORT` | No | `3001` | TCP port the HTTP server listens on. |
| `NODE_ENV` | No | `development` | Runtime environment: `development`, `test`, or `production`. Controls HIPAA hard-exits, compression, and logging. |
| `TRUST_PROXY` | No | `1` in prod | Number of proxy hops to trust for `req.ip`. Set `false` for direct connections. See [Express behind proxies](https://expressjs.com/en/guide/behind-proxies.html). |
| `WEB_URL` | No | `http://localhost:3000` | Frontend origin — used for CORS headers and Socket.IO origin allowlist. |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | Comma-separated list of origins allowed by the CORS middleware. |
| `MAX_REQUEST_BODY_SIZE` | No | `10kb` | Maximum JSON body size for standard endpoints. |
| `AI_REQUEST_BODY_SIZE` | No | `50kb` | Maximum JSON body size for AI (`/api/v1/ai`) endpoints. |

---

### Database

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGO_URI` | **Yes** | — | MongoDB connection string. Logged at startup with credentials redacted. |
| `MONGO_MAX_POOL_SIZE` | No | `10` | Maximum number of connections in the Mongoose connection pool. |

---

### Authentication (JWT)

All JWT secrets must be **at least 32 characters** long. Shorter values are rejected at startup.

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_ACCESS_TOKEN_SECRET` | **Yes** | — | Signs short-lived access tokens (default expiry: 15 min). |
| `JWT_REFRESH_TOKEN_SECRET` | **Yes** | — | Signs long-lived refresh tokens (default expiry: 7 d). |
| `JWT_TEMP_TOKEN_SECRET` | No | `''` | Signs temporary MFA step-up tokens. Should be set in production. |
| `JWT_ISSUER` | No | `health-watchers-api` | `iss` claim written into every JWT. |
| `JWT_AUDIENCE` | No | `health-watchers-client` | `aud` claim written into every JWT. |
| `JWT_ACCESS_TOKEN_EXPIRY` | No | `15m` | Expiry duration string for access tokens (e.g. `15m`, `1h`). |
| `JWT_REFRESH_TOKEN_EXPIRY` | No | `7d` | Expiry duration string for refresh tokens. |

**Rotation:** rotate `JWT_ACCESS_TOKEN_SECRET` and `JWT_REFRESH_TOKEN_SECRET` monthly in production. After rotation all existing tokens are immediately invalid — users must re-authenticate.

---

### Redis

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL` | No (prod: **strongly recommended**) | — | Connection URL, e.g. `redis://localhost:6379` or `rediss://user:pass@host:6380`. Used for distributed rate limiting, response caching, token denylist, and job queues. |

**Without `REDIS_URL` in production:**
- Rate limiting is per-pod in-memory — brute-force bypass is possible in multi-replica deployments.
- Token denylist (logout / logout-all) is not shared between pods.
- Response caching is disabled.
- A startup warning is printed to stderr.

---

### Stellar Blockchain

| Variable | Required | Default | Description |
|---|---|---|---|
| `STELLAR_NETWORK` | No | `testnet` | `testnet` or `mainnet`. Changes the Horizon URL and enables mainnet safety gate. |
| `STELLAR_SECRET_KEY` | No | `''` | Server-side signing key for Stellar transactions. **Never expose to clients.** |
| `STELLAR_PLATFORM_PUBLIC_KEY` | No | `''` | Platform's Stellar public key — shown to users for payment verification. |
| `STELLAR_SERVICE_URL` | No | `http://localhost:3002` | Base URL of the Stellar microservice. |
| `SUPPORTED_ASSETS` | No | `XLM` | Comma-separated list of accepted Stellar asset codes (e.g. `XLM,USDC`). |
| `STELLAR_MAX_TRANSACTION_XLM` | No | `1000` | Hard limit (XLM) per single transaction. |
| `STELLAR_DRY_RUN` | No | `false` | When `true`, transactions are simulated but never submitted to the network. |
| `STELLAR_TX_TIMEOUT_SECONDS` | No | `30` | Seconds before a submitted transaction times out. |
| `MAINNET_CONFIRMED` | No | `false` | Must be `true` to allow live mainnet transactions. The stellar-service exits if this is missing when `STELLAR_NETWORK=mainnet`. |
| `PAYMENT_INTENT_EXPIRY_HOURS` | No | `24` | Hours before an unpaid payment intent expires. |

---

### AI / LLM

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | No | `''` | Google Gemini API key. AI features are disabled when not set. |

---

### HIPAA — PHI Encryption

> These keys are validated at startup. In production, missing **critical** keys cause a hard exit.

#### Field-level encryption — § 164.312(a)(2)(iv)

| Variable | Required (prod) | Format | Description |
|---|---|---|---|
| `FIELD_ENCRYPTION_KEY` | **Yes** | 64-char hex | AES-256 key for encrypting PHI fields (names, dates of birth, contact numbers, etc.) at rest. **Hard exit if missing in production.** |
| `FIELD_ENCRYPTION_KEY_VERSION` | No | string | Version label for the active key (e.g. `v3`). Used during key rotation to identify which version encrypted a given record. |

**Generating a key:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Key rotation procedure:**
1. Generate a new 64-char hex key.
2. Set `FIELD_ENCRYPTION_KEY` to the new key and increment `FIELD_ENCRYPTION_KEY_VERSION`.
3. Run the migration script to re-encrypt existing records with the new key.
4. Archive the old key as `FIELD_ENCRYPTION_KEY_V<n>` for decryption of legacy records during the migration window.
5. Rotate annually at minimum; immediately upon suspected compromise.

#### Audit log encryption — § 164.312(b)

| Variable | Required (prod) | Format | Description |
|---|---|---|---|
| `AUDIT_ENCRYPTION_KEY` | Recommended | 64-char hex | AES-256 key for encrypting audit log metadata at rest. Production warning if missing. |

#### Backup encryption — § 164.312(c)(1)

| Variable | Required (prod) | Format | Description |
|---|---|---|---|
| `BACKUP_ENCRYPTION_KEY` | Recommended | ≥ 32 chars | Passphrase for AES-256 encryption of MongoDB backups. Production warning if missing. |

Generate a strong passphrase:

```bash
openssl rand -base64 32
```

#### Keypair encryption

| Variable | Required | Description |
|---|---|---|
| `KEYPAIR_ENCRYPTION_KEY` | No | Key used to encrypt stored Stellar keypairs at rest. |

---

### HIPAA — Data Retention

| Variable | Default | Description |
|---|---|---|
| `CLINICAL_RETENTION_YEARS` | `7` | Years to retain clinical records before destruction eligibility. HIPAA minimum is 6 years from creation or 2 years after patient's last visit, whichever is longer. |
| `AUDIT_LOG_RETENTION_YEARS` | `6` | Years to retain audit log entries. HIPAA § 164.312(b) minimum is 6 years. |

---

### HIPAA — Security Training — § 164.308(a)(5)

| Variable | Default | Description |
|---|---|---|
| `SECURITY_TRAINING_EXPIRY_DAYS` | `365` | Days before a staff member's security training record expires and re-training is required. |

---

### Email / SMTP — § 164.410 Breach Notification

| Variable | Required (prod) | Description |
|---|---|---|
| `SMTP_HOST` | Recommended | SMTP server hostname (e.g. `smtp.sendgrid.net`). Production warning if missing — automated breach notification emails cannot be sent. |
| `SMTP_PORT` | No | SMTP port. Default: `587`. |
| `SMTP_SECURE` | No | Set `true` to use TLS (port 465). Default: `false` (STARTTLS on port 587). |
| `SMTP_USER` | No | SMTP authentication username. |
| `SMTP_PASS` | No | SMTP authentication password. |
| `SMTP_FROM` | No | Sender address for system emails (e.g. `no-reply@health-watchers.app`). |
| `APP_BASE_URL` | No | Base URL of the web app — used to build links inside emails. |

---

### File Storage

| Variable | Default | Description |
|---|---|---|
| `STORAGE_DRIVER` | `local` | `local` for development, `s3` for production. |
| `LOCAL_UPLOAD_DIR` | `./uploads` | Directory for locally stored files (dev only). |
| `S3_BUCKET` | `''` | S3 bucket name for patient photos and documents. |
| `S3_REGION` | `us-east-1` | AWS region of the S3 bucket. |
| `S3_ACCESS_KEY_ID` | `''` | AWS access key ID with S3 read/write permissions. |
| `S3_SECRET_ACCESS_KEY` | `''` | AWS secret access key corresponding to the above. |

---

### Monitoring & Observability

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | Pino log level: `debug`, `info`, `warn`, or `error`. |
| `SENTRY_DSN` | — | Sentry ingest URL for error tracking and performance profiling. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OpenTelemetry collector endpoint. Leave blank to disable OTLP export. |
| `OTEL_SAMPLING_RATE` | `1.0` | Fraction of requests to trace (0.0–1.0). Use `0.1` in high-traffic production. |
| `METRICS_USERNAME` | — | HTTP Basic Auth username for the `GET /metrics` (Prometheus) endpoint. |
| `METRICS_PASSWORD` | — | HTTP Basic Auth password for the `GET /metrics` endpoint. |
| `METRICS_ALLOWED_IPS` | — | Comma-separated IP allowlist for `/metrics` scraping (alternative to Basic Auth). |
| `ENV_NAME` | `development` | Logical environment label attached to metrics and traces (e.g. `staging`, `production`). |

---

### Backup & Disaster Recovery

| Variable | Default | Description |
|---|---|---|
| `BACKUP_BUCKET` | — | S3 bucket name for storing encrypted backups. |
| `BACKUP_RETENTION_DAYS` | `30` | Days to keep backup archives before automatic deletion. |
| `AWS_REGION` | `us-east-1` | AWS region used for backup bucket operations. |
| `ENABLE_SECRETS_MANAGER` | `false` | Set `true` to pull secrets from AWS Secrets Manager at startup instead of environment variables. |

---

### Webhook Secrets

| Variable | Description |
|---|---|
| `INSURANCE_WEBHOOK_SECRET` | HMAC secret for verifying inbound insurance-company webhook signatures. |
| `STELLAR_SERVICE_SECRET` | Shared secret between the API and the Stellar microservice for mutual authentication. |

---

## Validation Behaviour

`src/config/env.ts` runs **synchronously** at import time (before any route or service is loaded).

| Condition | Behaviour |
|---|---|
| Required variable missing | Print error table → `process.exit(1)` |
| `JWT_*_SECRET` shorter than 32 chars | Print error table → `process.exit(1)` |
| `FIELD_ENCRYPTION_KEY` missing in production | Print HIPAA violation → `process.exit(1)` |
| `REDIS_URL` missing in production | `console.warn` (non-fatal) |
| `AUDIT_ENCRYPTION_KEY` missing in production | `console.warn` (non-fatal) |
| `BACKUP_ENCRYPTION_KEY` missing in production | `console.warn` (non-fatal) |
| `SMTP_HOST` missing in production | `console.warn` (non-fatal) |

---

## Adding a New Variable

1. Add it to the Zod schema in `src/config/env.ts`:
   ```ts
   MY_NEW_VAR: z.string().min(1, 'MY_NEW_VAR is required'),
   ```
2. Export it from `env` and consume it via `src/config/config.service.ts`:
   ```ts
   // config.service.ts
   mySection: {
     myNewVar: env.MY_NEW_VAR,
   }
   ```
3. Document it in this file and in `.env.example`.
4. Add a production check (`console.warn` or `process.exit`) when the variable is security-sensitive.

---

## Related Files

| File | Purpose |
|---|---|
| `src/config/env.ts` | Zod schema, validation, and HIPAA production checks |
| `src/config/config.service.ts` | Typed `appConfig` object consumed by all services |
| `.env.example` | Template with every variable listed and documented inline |
