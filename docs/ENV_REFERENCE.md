# Environment Variables Reference

Complete reference for all environment variables used by Health Watchers, auto-generated from the validation schema in `apps/api/src/config/env.ts`.

**Last Updated:** October 17, 2026

---

## Table of Contents

1. [Server Configuration](#server-configuration)
2. [Database](#database)
3. [Authentication & Secrets](#authentication--secrets)
4. [Stellar Blockchain](#stellar-blockchain)
5. [Security & Encryption](#security--encryption)
6. [Compliance & HIPAA](#compliance--hipaa)
7. [Email & Communications](#email--communications)
8. [Caching & Performance](#caching--performance)
9. [Integrations & External Services](#integrations--external-services)
10. [Logging & Monitoring](#logging--monitoring)

---

## Server Configuration

### API_PORT
- **Type:** `string`
- **Default:** `'3001'`
- **Description:** Port the Express API server listens on
- **Example:** `API_PORT=3001`

### NODE_ENV
- **Type:** `string`
- **Optional:** Yes
- **Description:** Node.js environment (development, production, test)
- **Example:** `NODE_ENV=production`

### WEB_URL
- **Type:** `string`
- **Default:** `'http://localhost:3000'`
- **Required:** Yes
- **Description:** Base URL of the web frontend; used for CORS and redirects
- **Example:** `WEB_URL=https://app.example.com`

### TRUST_PROXY
- **Type:** `string`
- **Optional:** Yes
- **Description:** Trust proxy header (set to 'true' or proxy count behind reverse proxy like Nginx)
- **Example:** `TRUST_PROXY=1`
- **Note:** Required in production when behind load balancer

---

## Database

### MONGO_URI
- **Type:** `string`
- **Required:** Yes
- **Description:** MongoDB connection string with credentials
- **Format:** `mongodb://user:pass@host:port/database` or `mongodb+srv://`
- **Example:** `MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/health_watchers`
- **Security:** Never commit to git; rotate credentials quarterly

---

## Authentication & Secrets

### JWT_ACCESS_TOKEN_SECRET
- **Type:** `string`
- **Required:** Yes
- **Minimum Length:** 32 characters
- **Description:** Secret key for signing access tokens (short-lived, ~15 minutes)
- **Example:** `JWT_ACCESS_TOKEN_SECRET=your-very-long-secret-key-with-32-chars-minimum`
- **Rotation:** Monthly in production
- **Security:** High entropy recommended; use `openssl rand -hex 32`

### JWT_REFRESH_TOKEN_SECRET
- **Type:** `string`
- **Required:** Yes
- **Minimum Length:** 32 characters
- **Description:** Secret key for signing refresh tokens (long-lived, ~7 days)
- **Example:** `JWT_REFRESH_TOKEN_SECRET=your-very-long-secret-key-with-32-chars-minimum`
- **Rotation:** Monthly in production; rotate with access token
- **Security:** High entropy recommended; use `openssl rand -hex 32`

### JWT_TEMP_TOKEN_SECRET
- **Type:** `string`
- **Optional:** Yes
- **Description:** Secret key for temporary tokens (password reset, email verification)
- **Example:** `JWT_TEMP_TOKEN_SECRET=your-secret-for-temporary-tokens-min-32-chars`

### JWT_SECRET
- **Type:** `string`
- **Optional:** Yes
- **Description:** Legacy JWT secret (prefer JWT_ACCESS_TOKEN_SECRET)
- **Note:** Deprecated; use JWT_ACCESS_TOKEN_SECRET instead

### JWT_ISSUER
- **Type:** `string`
- **Optional:** Yes
- **Description:** JWT issuer claim (`iss`); identifies who issued the token
- **Example:** `JWT_ISSUER=health-watchers-api`

### JWT_AUDIENCE
- **Type:** `string`
- **Optional:** Yes
- **Description:** JWT audience claim (`aud`); identifies intended recipient
- **Example:** `JWT_AUDIENCE=health-watchers-client`

---

## Stellar Blockchain

### STELLAR_NETWORK
- **Type:** `enum`
- **Values:** `'testnet'` | `'mainnet'`
- **Default:** `'testnet'`
- **Description:** Which Stellar network to use (test vs. production)
- **Warning:** Set to mainnet only in production after careful testing

### STELLAR_PORT
- **Type:** `number` (as string)
- **Default:** `'3002'`
- **Description:** Port the stellar-service microservice listens on
- **Example:** `STELLAR_PORT=3002`

### STELLAR_SERVICE_URL
- **Type:** `string`
- **Default:** `'http://localhost:3002'`
- **Description:** Base URL of the stellar-service; used by API to call stellar microservice
- **Example:** `STELLAR_SERVICE_URL=http://stellar-service:3002`

### STELLAR_SECRET_KEY
- **Type:** `string` (Stellar private key)
- **Required in Production:** Yes
- **Description:** Stellar account private key for signing transactions (server-side)
- **⚠️ WARNING:** Never expose to clients or commit to git
- **Format:** Starts with 'S', 56 characters
- **Generation:** https://laboratory.stellar.org/#account-creator (testnet only)
- **Rotation:** Annually with new keypair + account migration
- **Example:** `STELLAR_SECRET_KEY=SAbc...`

### STELLAR_PUBLIC_KEY
- **Type:** `string` (Stellar public key)
- **Required in Production:** Yes
- **Description:** Stellar account public key (read-only, can be shared)
- **Format:** Starts with 'G', 56 characters
- **Example:** `STELLAR_PUBLIC_KEY=GABC...`

### STELLAR_PLATFORM_PUBLIC_KEY
- **Type:** `string` (Stellar public key)
- **Optional:** Yes
- **Description:** Secondary Stellar public key for the platform account (multi-sig)
- **Example:** `STELLAR_PLATFORM_PUBLIC_KEY=GABC...`

### SUPPORTED_ASSETS
- **Type:** `string` (comma-separated)
- **Default:** `'XLM'`
- **Description:** List of supported Stellar asset codes (XLM always included)
- **Example:** `SUPPORTED_ASSETS=XLM,USDC,EURC`
- **Note:** Assets must be configured in Stellar issuer account

### MAINNET_CONFIRMED
- **Type:** `string` (boolean)
- **Default:** `'false'`
- **Description:** Explicit confirmation to enable mainnet transactions
- **Required:** Must be 'true' when STELLAR_NETWORK=mainnet
- **Security:** stellar-service exits with code 1 if mainnet without confirmation
- **⚠️ WARNING:** Setting to 'true' enables REAL XLM transactions on mainnet

### STELLAR_MAX_TRANSACTION_XLM
- **Type:** `number` (as string)
- **Default:** `'1000'`
- **Description:** Maximum XLM allowed in a single transaction
- **Example:** `STELLAR_MAX_TRANSACTION_XLM=5000`

### STELLAR_DRY_RUN
- **Type:** `string` (boolean)
- **Default:** `'false'`
- **Description:** Simulate transactions without submitting to network
- **Use Case:** Testing and development
- **Example:** `STELLAR_DRY_RUN=true`

### STELLAR_TX_TIMEOUT_SECONDS
- **Type:** `number` (as string)
- **Default:** `'30'`
- **Description:** Timeout for transaction submission (seconds)
- **Values:**
  - 30 seconds: Immediate payments
  - 86400 seconds: Multi-sig payments
  - 2592000 seconds: Escrow payments (30 days)
- **Example:** `STELLAR_TX_TIMEOUT_SECONDS=30`

### API_URL
- **Type:** `string`
- **Default:** `'http://localhost:3001'`
- **Description:** Base URL of this API (used by stellar-service for webhooks)
- **Example:** `API_URL=https://api.example.com`

---

## Security & Encryption

### FIELD_ENCRYPTION_KEY
- **Type:** `string` (hex)
- **Length:** Exactly 64 characters (32 bytes = AES-256)
- **Optional:** Yes (required in production)
- **Description:** AES-256 encryption key for PHI field-level encryption
- **HIPAA:** § 164.312(a)(2)(iv) — Technical Safeguard
- **Generation:** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **Example:** `FIELD_ENCRYPTION_KEY=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2`
- **Rotation:** Annually; keep old key as FIELD_ENCRYPTION_KEY_V<n> during migration
- **Production Warning:** Missing in production → HIPAA violation, process exits

### FIELD_ENCRYPTION_KEY_VERSION
- **Type:** `string`
- **Optional:** Yes
- **Description:** Current encryption key version (for rotation tracking)
- **Example:** `FIELD_ENCRYPTION_KEY_VERSION=v1`

### AUDIT_ENCRYPTION_KEY
- **Type:** `string` (hex)
- **Length:** Exactly 64 characters (32 bytes = AES-256)
- **Optional:** Yes (recommended in production)
- **Description:** AES-256 encryption key for audit log encryption at rest
- **HIPAA:** § 164.312(b) — Audit Safeguard
- **Generation:** Same as FIELD_ENCRYPTION_KEY
- **Production Warning:** Missing → logs will not be encrypted; warning emitted

### BACKUP_ENCRYPTION_KEY
- **Type:** `string`
- **Minimum Length:** 32 characters
- **Optional:** Yes (recommended in production)
- **Description:** Encryption key for database backups
- **HIPAA:** § 164.312(c)(1) — Backup Safeguard
- **Example:** `BACKUP_ENCRYPTION_KEY=your-strong-backup-passphrase`
- **Production Warning:** Missing → backups not encrypted; warning emitted

---

## Compliance & HIPAA

### CLINICAL_RETENTION_YEARS
- **Type:** `string` (number)
- **Default:** `'7'`
- **Description:** How long to retain clinical records (years)
- **HIPAA:** Minimum 6 years; Health Watchers default 7
- **Example:** `CLINICAL_RETENTION_YEARS=7`

### AUDIT_LOG_RETENTION_YEARS
- **Type:** `string` (number)
- **Default:** `'6'`
- **Description:** How long to retain audit logs (years)
- **HIPAA:** Minimum 6 years for compliance audits
- **Example:** `AUDIT_LOG_RETENTION_YEARS=6`

### SECURITY_TRAINING_EXPIRY_DAYS
- **Type:** `string` (number)
- **Default:** `'365'`
- **Description:** Annual security training expiry window (days)
- **HIPAA:** § 164.308(a)(5) — Training enforcement
- **Example:** `SECURITY_TRAINING_EXPIRY_DAYS=365`

---

## Email & Communications

### SMTP_HOST
- **Type:** `string`
- **Optional:** Yes
- **Description:** SMTP server hostname (for breach notifications, password resets)
- **HIPAA:** § 164.410 — Breach Notification
- **Example:** `SMTP_HOST=smtp.sendgrid.net`
- **Production Warning:** Missing → breach notifications won't be sent

### SMTP_PORT
- **Type:** `string` (number)
- **Optional:** Yes
- **Description:** SMTP server port
- **Common Values:** 25 (unencrypted), 465 (TLS), 587 (STARTTLS)
- **Example:** `SMTP_PORT=587`

### SMTP_SECURE
- **Type:** `string` (boolean)
- **Optional:** Yes
- **Description:** Use TLS for SMTP connection
- **Example:** `SMTP_SECURE=true`

### SMTP_USER
- **Type:** `string`
- **Optional:** Yes
- **Description:** SMTP authentication username
- **Example:** `SMTP_USER=apikey`

### SMTP_PASS
- **Type:** `string`
- **Optional:** Yes
- **Description:** SMTP authentication password
- **Security:** Never commit to git
- **Example:** `SMTP_PASS=your-sendgrid-api-key`

### SMTP_FROM
- **Type:** `string` (email)
- **Optional:** Yes
- **Description:** Email address to send notifications from
- **Example:** `SMTP_FROM=notifications@example.com`

### APP_BASE_URL
- **Type:** `string` (URL)
- **Optional:** Yes
- **Description:** Base URL for email links (password resets, confirmations)
- **Example:** `APP_BASE_URL=https://app.example.com`

---

## Caching & Performance

### REDIS_URL
- **Type:** `string` (URL)
- **Optional:** Yes
- **Description:** Redis connection URL for distributed rate limiting and caching
- **Format:** `redis://user:pass@host:port` or `rediss://` (TLS)
- **Example:** `REDIS_URL=redis://localhost:6379`
- **Production Warning:** Missing → in-memory rate limiting (per-pod, not shared)
- **Security Impact:** Without Redis, attackers can bypass rate limiting by distributing requests across pods

### LOG_LEVEL
- **Type:** `enum`
- **Values:** `'debug'` | `'info'` | `'warn'` | `'error'`
- **Default:** `'info'`
- **Description:** Minimum log level to output
- **Example:** `LOG_LEVEL=debug`

---

## Integrations & External Services

### GEMINI_API_KEY
- **Type:** `string` (API key)
- **Optional:** Yes
- **Description:** Google Gemini API key (for clinical decision support)
- **Example:** `GEMINI_API_KEY=your-gemini-api-key`
- **Security:** Keep private; rotate if exposed

---

## CORS & Network

### ALLOWED_ORIGINS
- **Type:** `string` (comma-separated URLs)
- **Optional:** Yes
- **Description:** Comma-separated list of origins allowed to call this API
- **Example:** `ALLOWED_ORIGINS=http://localhost:3000,https://app.example.com`

---

## Logging & Monitoring

### SENTRY_DSN
- **Type:** `string` (URL)
- **Optional:** Yes
- **Description:** Sentry error tracking DSN (captures unhandled exceptions)
- **Format:** `https://<key>@sentry.io/<project>`
- **Example:** `SENTRY_DSN=https://abc123@sentry.io/1234567`
- **Security:** DSN can be public-safe; no credentials to rotate

---

## Loading Environment Variables

### Development

```bash
# Copy example to .env and fill in values
cp .env.example .env

# Load in development server (automatically via dotenv)
npm run dev
```

### Production

```bash
# Set via environment (never commit .env)
export MONGO_URI="mongodb+srv://user:pass@cluster.mongodb.net/health_watchers"
export JWT_ACCESS_TOKEN_SECRET="your-secret"
# ... other vars

# Or via Docker/Kubernetes secrets
docker run -e MONGO_URI="..." -e JWT_ACCESS_TOKEN_SECRET="..." app
```

### Validation

The API validates all environment variables at startup using Zod schemas in `apps/api/src/config/env.ts`.

**Validation Output:**

```
✅ Config validated:
   API_PORT:        3001
   MONGO_URI:       mongodb+srv://...
   STELLAR_NETWORK: testnet
   LOG_LEVEL:       info
   HIPAA FIELD_ENCRYPTION_KEY: ✅ set
   HIPAA AUDIT_ENCRYPTION_KEY: ⚠️  NOT SET
   HIPAA BACKUP_ENCRYPTION_KEY: ⚠️  NOT SET
   HIPAA SMTP_HOST:             ⚠️  NOT SET
```

If validation fails, the process exits with code 1.

---

## Security Best Practices

1. **Never commit `.env` to git** — it's in `.gitignore`
2. **Rotate secrets monthly** — JWT secrets, API keys, database credentials
3. **Use strong secrets** — minimum 32 characters, high entropy
4. **Encrypt backups** — set BACKUP_ENCRYPTION_KEY in production
5. **Enable field encryption** — set FIELD_ENCRYPTION_KEY in production
6. **Use TLS for Redis** — `rediss://` with certificate verification
7. **Enable SMTP for breach notifications** — HIPAA § 164.410 requirement
8. **Audit log encryption** — set AUDIT_ENCRYPTION_KEY in production
9. **Monitor for missing vars** — review startup logs for warnings
10. **Separate per environment** — dev/staging/prod each have different secrets

---

## Troubleshooting

### Validation Error: "Missing required env var: MONGO_URI"

**Cause:** Database connection string not set
**Solution:** Set `MONGO_URI` with MongoDB connection string
```bash
export MONGO_URI="mongodb://localhost:27017/health_watchers"
```

### Validation Error: "JWT_ACCESS_TOKEN_SECRET must be at least 32 characters"

**Cause:** Secret too short (security requirement)
**Solution:** Generate stronger secret
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Warning: "REDIS_URL is not set in production"

**Cause:** Distributed rate limiting disabled
**Solution:** Configure Redis for production
```bash
export REDIS_URL="redis://localhost:6379"
```

### Warning: "HIPAA VIOLATION: FIELD_ENCRYPTION_KEY is not set in production"

**Cause:** PHI encryption disabled in production (HIPAA violation)
**Solution:** Generate and set encryption key
```bash
export FIELD_ENCRYPTION_KEY="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
```

---

## Related Documentation

- [HIPAA Compliance](./HIPAA_COMPLIANCE.md)
- [Security Best Practices](./SECURITY.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Config Schema](../apps/api/src/config/env.ts)
