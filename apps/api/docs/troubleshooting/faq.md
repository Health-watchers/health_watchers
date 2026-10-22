# Frequently Asked Questions

Answers to the most common questions from developers, operators, and support teams.

---

## Table of Contents

- [General](#general)
- [Environment & Configuration](#environment--configuration)
- [Authentication & Security](#authentication--security)
- [Database & Migrations](#database--migrations)
- [Payments & Stellar](#payments--stellar)
- [Performance & Scaling](#performance--scaling)
- [HIPAA & Compliance](#hipaa--compliance)
- [Monitoring & Observability](#monitoring--observability)
- [Deployment & DevOps](#deployment--devops)
- [Developer Workflow](#developer-workflow)

---

## General

### What port does the API run on?

The default port is `3001`, controlled by `API_PORT` in your environment. The Dockerfile and docker-compose files expose this port. Change it by setting `API_PORT=4000` (or any free port) before starting.

---

### Where do I find the API documentation?

- **Swagger UI** (interactive): `GET /api-docs` while the server is running.
- **OpenAPI JSON**: `apps/api/docs/openapi.json`
- **Markdown docs**: `apps/api/docs/`

---

### How do I check if the server is healthy?

```bash
# Liveness — is the process alive?
curl http://localhost:3001/health/live

# Readiness — is DB + Redis connected?
curl http://localhost:3001/health/ready

# Startup — for Kubernetes startupProbe
curl http://localhost:3001/health/startup
```

All return `{ "status": "ok" }` on success.

---

### What's the difference between `/api/v1` and `/api/v2`?

- `/api/v1` — original endpoints (patients, auth, appointments, payments, billing).
- `/api/v2` — extended endpoints with additional features (AI, advanced analytics, cache control, admin tools, webhooks).

Both versions are active simultaneously. See `docs/api-versioning-strategy.md` for the full versioning policy.

---

### How do I get a list of all available routes?

```bash
# Swagger lists all routes with parameters and schemas
open http://localhost:3001/api-docs

# Or check the versions endpoint
curl http://localhost:3001/api/versions
```

---

### The server crashed and I don't know why. Where do I look?

1. Check the process exit code — code `1` means an intentional shutdown (env validation, HIPAA check, DB connect failure).
2. Check the last lines before exit: `docker logs health-watchers-api --tail 50`
3. Filter for errors: `docker logs health-watchers-api 2>&1 | jq 'select(.level >= 50)'`
4. Search Sentry for any unhandled exceptions that occurred before the crash.

---

## Environment & Configuration

### What is the minimum set of env vars to start in development?

```bash
MONGO_URI=mongodb://localhost:27017/health_watchers
JWT_ACCESS_TOKEN_SECRET=<at-least-32-random-chars>
JWT_REFRESH_TOKEN_SECRET=<at-least-32-random-chars>
```

Everything else has a default or is optional in development. Copy `.env.example` as a starting point.

---

### What is the minimum set of env vars required in production?

Beyond the development minimum, production also requires:

```bash
NODE_ENV=production
FIELD_ENCRYPTION_KEY=<64-char hex>        # hard exit if missing
JWT_TEMP_TOKEN_SECRET=<32+ chars>         # not in Zod schema — set manually
REDIS_URL=rediss://<host>:6379            # rate limiting + cache
AUDIT_ENCRYPTION_KEY=<64-char hex>        # HIPAA warning if missing
BACKUP_ENCRYPTION_KEY=<32+ chars>         # HIPAA warning if missing
SMTP_HOST=<smtp-server>                   # HIPAA warning if missing
ALLOWED_ORIGINS=https://app.yourdomain.com
WEB_URL=https://app.yourdomain.com
TRUST_PROXY=1
SENTRY_DSN=https://...@sentry.io/...
```

Run the server once and check the startup log — it prints `✅ set` or `⚠️ NOT SET` for every HIPAA-critical key.

---

### Why does the server print `API_PORT: 3001` but I set `API_PORT=4000`?

The `env.ts` Zod schema defaults `API_PORT` to `'3001'` if the variable is not present. If you set it and still see `3001`, the env var is not being loaded. Verify:

```bash
# Check the env file is being read
grep API_PORT .env

# Check the value the process actually sees
node -e "require('./dist/config/env'); console.log(process.env.API_PORT)"
```

In Docker, ensure the `.env` file is referenced via `env_file:` in `docker-compose.yml`.

---

### How do I generate secure secrets for JWT and encryption keys?

```bash
# 32-byte hex (64 chars) — for JWT secrets and encryption keys
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Base64 alternative
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# For BACKUP_ENCRYPTION_KEY (min 32 chars, any format works)
node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"
```

Store secrets in a secret manager (AWS Secrets Manager, HashiCorp Vault, etc.) — never commit them to git.

---

### Why is `JWT_TEMP_TOKEN_SECRET` not validated by the Zod schema?

This is a known gap. The variable is read directly from `process.env` inside `token.service.ts` but is not declared in `envSchema` in `env.ts`. If it's unset, `jsonwebtoken` signs with an empty string and will accept forged MFA challenge tokens.

**Always set `JWT_TEMP_TOKEN_SECRET`** to a strong secret (32+ chars). A fix to add it to the Zod schema is tracked as a known issue.

---

### What does `TRUST_PROXY` do and when should I set it?

When the API is behind a reverse proxy (nginx, AWS ALB, Cloudflare), the client's real IP is in the `X-Forwarded-For` header, not `req.socket.remoteAddress`. Setting `TRUST_PROXY=1` tells Express to trust one proxy hop and use `X-Forwarded-For` as the real IP.

This is important for rate limiting — without it, all clients appear to come from the proxy's IP and share a single rate-limit bucket.

| Deployment | Setting |
|---|---|
| Direct (no proxy) | `TRUST_PROXY=false` or unset |
| Behind 1 proxy (nginx, ALB) | `TRUST_PROXY=1` |
| Behind 2 proxies | `TRUST_PROXY=2` |
| Cloudflare + ALB (2 hops) | `TRUST_PROXY=2` |

---

### Can I run multiple instances of the API?

Yes, but you **must** set `REDIS_URL`. Without Redis:
- Rate limiters are per-pod (each pod has its own counter).
- Socket.IO events are not broadcast across pods.
- Response cache is not shared.

With Redis, all of these work correctly across any number of pods.

---

## Authentication & Security

### How long do tokens last?

| Token | Lifetime | Configurable |
|---|---|---|
| Access token | 15 minutes | `JWT_ACCESS_TOKEN_EXPIRY` |
| Refresh token | 7 days | `JWT_REFRESH_TOKEN_EXPIRY` |
| MFA temp token | 5 minutes | Hardcoded |
| Password reset token | 1 hour | Hardcoded |

---

### Why was my user suddenly logged out everywhere?

One of these happened:

1. **`POST /auth/logout-all` was called** — either by the user or a SUPER_ADMIN.
2. **Password was changed** — all prior tokens are invalidated on password change.
3. **SUPER_ADMIN revoked sessions** — check audit logs for `LOGOUT_ALL` or `USER_SESSIONS_REVOKED`.
4. **Refresh token family revoked** — replay detection triggered (a refresh token was used twice).
5. **`JWT_ACCESS_TOKEN_SECRET` was rotated** — all existing tokens are instantly invalid.

Check the audit log:
```javascript
db.auditlogs.find({
  userId: "<userId>",
  action: { $in: ["LOGOUT_ALL", "USER_SESSIONS_REVOKED", "PASSWORD_CHANGED"] }
}).sort({ createdAt: -1 }).limit(5)
```

---

### Which roles require MFA?

MFA is **mandatory** for: `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`.

MFA is **optional** for: `ASSISTANT`, `READ_ONLY`, `PATIENT`.

There is a 7-day grace period after account creation. After that, mandatory-MFA roles cannot log in without completing MFA setup.

---

### Can a CLINIC_ADMIN disable MFA for a DOCTOR?

No. The API enforces: if a user's role requires MFA (`DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN`), `DELETE /auth/mfa/disable` returns `403 Forbidden` regardless of who calls it.

To reset MFA for a locked-out user, a SUPER_ADMIN must directly update the database — see [authentication-issues.md §MFA Issues](./authentication-issues.md#mfa-issues).

---

### Why do I get `403 Forbidden` even though my JWT is valid?

A valid JWT only proves identity. Authorization (what you can do) is role-based. Common causes:

- Your role doesn't have permission for that endpoint.
- The resource belongs to a different clinic than your token's `clinicId`.
- The route requires SUPER_ADMIN but your role is CLINIC_ADMIN.
- `X-CSRF-Token` header is missing on a state-changing request.

Decode your token and check the `role` and `clinicId` claims.

---

### How does the account lockout work?

After **5 consecutive failed login attempts** (wrong password), or **5 failed MFA attempts**, the account is locked for **15 minutes**.

A SUPER_ADMIN can unlock immediately: `POST /api/v1/auth/unlock` with `{ "email": "..." }`.

Note: the config has `LOCKOUT_DURATION_MS = 30 min` in `constants.ts` but the controller uses a local `LOCK_DURATION_MS = 15 min`. The effective lockout is **15 minutes**.

---

### What is the `tempToken` returned during MFA login?

When a user with MFA enabled logs in successfully with their password, the API does not issue an access token yet. Instead it returns a short-lived `tempToken` (5-minute expiry) that represents "password verified, MFA pending."

The client must present this `tempToken` to `POST /auth/mfa/challenge` along with the TOTP code to complete login and receive the real `accessToken` + `refreshToken`.

The `tempToken` is signed with `JWT_TEMP_TOKEN_SECRET` — ensure this is set.

---

## Database & Migrations

### How do I run migrations?

```bash
# From apps/api/
npm run migrate:up       # apply all pending migrations
npm run migrate:status   # check what's applied and what's pending
npm run migrate:down     # roll back the last migration
```

Always run `migrate:status` after deploying to confirm all migrations are applied.

---

### Can I run migrations automatically on startup?

The app does not auto-run `migrate-mongo up` on startup. This is intentional — running migrations inside `startServer()` on a multi-pod deploy would cause concurrent migration runs.

Run migrations as a pre-deployment CI/CD step or Kubernetes Job before pods start.

---

### A migration failed halfway through. What do I do?

1. Do not re-run immediately — check what the migration partially did.
2. Look at `db.changelog` for a stuck entry.
3. Manually fix or undo the partial change (e.g., drop a partially-built index).
4. Delete the stuck changelog entry: `db.changelog.deleteOne({ fileName: '...' })`.
5. Re-run: `npm run migrate:up`.

Full details: [migration-troubleshooting.md §Failed Migrations](./migration-troubleshooting.md#failed-migrations).

---

### Why is the `migrate-mongo` command not found?

```bash
# It's a project dependency, not global. Run via npm scripts:
npm run migrate:status

# Or with npx from apps/api/:
npx migrate-mongo status
```

---

### My query is slow. How do I find the missing index?

```javascript
// Enable profiling (queries > 100ms)
mongosh "$MONGO_URI" --eval "db.setProfilingLevel(1, { slowms: 100 })"

// After reproducing the slow query:
mongosh "$MONGO_URI" --eval "
db.system.profile.find({ millis: { \$gt: 100 } }).sort({ ts: -1 }).limit(5)
  .forEach(p => print(p.ns, p.millis + 'ms', p.planSummary))
"
```

If `planSummary` shows `COLLSCAN`, a compound index on the queried fields will fix it. See [database-troubleshooting.md §Required Indexes](./database-troubleshooting.md#required-indexes-for-this-application).

---

### Can I use the app with MongoDB Atlas free tier (M0)?

For development, yes. For production, no. M0 has a 500-connection limit and no dedicated resources. The API default pool size of 10 connections per pod is fine for a single dev pod, but M0 is not suitable for production workloads.

Use M10 or higher for production.

---

## Payments & Stellar

### What is the difference between testnet and mainnet?

`STELLAR_NETWORK=testnet` uses Stellar's public test network — all accounts, transactions, and XLM are fake and have no real value. Use this for development and staging.

`STELLAR_NETWORK=mainnet` uses the real Stellar network. Real XLM is transferred. Setting `MAINNET_CONFIRMED=true` is required as a safety gate. Never use mainnet without explicit confirmation.

---

### How do I fund a testnet account?

Use the Stellar Friendbot:
```bash
curl "https://friendbot.stellar.org?addr=$STELLAR_PLATFORM_PUBLIC_KEY"
```

This gives 10,000 XLM on testnet. Mainnet accounts must be funded by real XLM transfer.

---

### A payment is stuck in `pending`. What do I do?

1. Find the `txHash` on the payment record.
2. Look up the transaction on Horizon directly.
3. If confirmed on Horizon but not in the DB, the webhook was not received — check `stellar-service` connectivity and webhook delivery records.
4. If not on Horizon, the transaction was never submitted — check `stellar-service` logs.
5. If the payment is > `PAYMENT_INTENT_EXPIRY_HOURS` old, it will be expired by the next job run.

Full diagnosis: [payment-issues.md §Unconfirmed Transactions](./payment-issues.md#unconfirmed-transactions).

---

### Can a dispute be re-opened after it's resolved?

No — once a dispute is `resolved_refund`, `resolved_no_action`, or `closed`, the status cannot be changed via the API. A SUPER_ADMIN can modify the dispute document directly in MongoDB if truly necessary, but this should be documented in the audit log.

---

### What happens if a refund fails on Stellar?

The dispute's `refundIntentId` is only set **after** a successful refund submission. If `stellar-service` returns an error during `issueRefund()`, the dispute status is not updated and the refund can be retried.

Check `stellar-service` logs for the specific Stellar error (most common: insufficient XLM balance, invalid destination account).

---

### Is `STELLAR_DRY_RUN=true` the default?

No — the default is `false` (real transactions). `STELLAR_DRY_RUN=true` must be explicitly set. It is useful for integration testing where you want the API to go through the full payment flow without submitting a real transaction to Horizon.

---

## Performance & Scaling

### What's the recommended `MONGODB_POOL_SIZE` for production?

Start with `10` (default) and increase based on observed pool utilization from the Prometheus metric `mongodb_connection_pool_size`. A simple formula:

```
Pool size per pod = (peak concurrent requests × avg query time in seconds) × safety factor (2×)
```

For example, 50 concurrent requests at 50ms average: `50 × 0.05 × 2 = 5` — default of 10 is fine. For higher concurrency, scale up, but stay within your Atlas tier's connection limit divided by the number of pods.

---

### How do I tell if the cache is working?

```bash
redis-cli -u "$REDIS_URL" INFO stats | grep -E 'keyspace_hits|keyspace_misses'
# hit_rate = hits / (hits + misses), should be > 80%
```

Also check warmup logs at startup:
```bash
grep "cache" /var/log/api/app.log | grep -i "warm"
```

---

### Why are AI endpoints slower than other endpoints?

AI endpoints (`/api/v2/ai/...`) call the Gemini API externally. Network latency to Google's API adds 200–800 ms depending on region. This is expected. The AI rate limiter caps at 20 req/min per clinic to prevent quota exhaustion.

If AI calls are consistently timing out, check `GEMINI_API_KEY` validity and Google AI Studio quota usage.

---

### How many pods can I run?

Unlimited, as long as:
- `REDIS_URL` is set (shared rate limiting, cache, and Socket.IO state).
- MongoDB connection limit is not exceeded (`MONGODB_POOL_SIZE × pod_count ≤ Atlas tier limit`).
- Migrations are run once before scaling up, not inside each pod.

---

## HIPAA & Compliance

### Which env vars are required for HIPAA compliance?

| Var | HIPAA Section | Hard exit if missing? |
|---|---|---|
| `FIELD_ENCRYPTION_KEY` | § 164.312(a)(2)(iv) — PHI encryption | **Yes** (production) |
| `AUDIT_ENCRYPTION_KEY` | § 164.312(b) — Audit log encryption | Warning only |
| `BACKUP_ENCRYPTION_KEY` | § 164.312(c)(1) — Backup integrity | Warning only |
| `SMTP_HOST` | § 164.410 — Breach notification | Warning only |

The startup log prints the status of each key:
```
HIPAA FIELD_ENCRYPTION_KEY: ✅ set
HIPAA AUDIT_ENCRYPTION_KEY: ⚠️  NOT SET
```

---

### What is the data retention policy?

| Data type | Retention | Config |
|---|---|---|
| Clinical records | 7 years (default) | `CLINICAL_RETENTION_YEARS` |
| Audit logs | 6 years (TTL index) | `AUDIT_LOG_RETENTION_YEARS` |
| Refresh tokens | 7 days (TTL index) | `JWT_REFRESH_TOKEN_EXPIRY` |
| Backups | 30 days (default) | `BACKUP_RETENTION_DAYS` |

HIPAA minimum for clinical records is 6 years. The default of 7 years provides a 1-year buffer.

---

### How do I rotate the `FIELD_ENCRYPTION_KEY`?

Never change `FIELD_ENCRYPTION_KEY` without running the rotation script first — all existing encrypted fields will become unreadable.

```bash
# 1. Set both old and new key
export FIELD_ENCRYPTION_KEY_OLD=<current 64-char key>
export FIELD_ENCRYPTION_KEY=<new 64-char key>

# 2. Run the rotation script (re-encrypts all PHI fields)
npx ts-node -r tsconfig-paths/register apps/api/scripts/rotate-encryption-key.ts

# 3. Verify decryption works with the new key
# 4. Remove FIELD_ENCRYPTION_KEY_OLD from environment
```

---

### Is patient data encrypted in transit?

The API itself does not terminate TLS — that is handled by the reverse proxy (nginx, ALB, Cloudflare). Ensure:
- HTTPS is enforced at the load balancer.
- `Strict-Transport-Security` (HSTS) header is set.
- The `TRUST_PROXY` env var is configured correctly so HTTPS is detected on redirects.

The API sets security headers via `createSecurityMiddleware()` (helmet.js) which includes HSTS.

---

### Where are audit logs stored?

In the `auditlogs` MongoDB collection. Every sensitive action (login, logout, patient record access, payment, role change, etc.) creates an entry.

Audit logs have a 6-year TTL index (`expireAfterSeconds: 189216000`). They are also optionally encrypted if `AUDIT_ENCRYPTION_KEY` is set.

Access via API: `GET /api/v2/audit` (requires SUPER_ADMIN).

---

### What security training is enforced?

The `SECURITY_TRAINING_EXPIRY_DAYS` variable (default: 365) controls how long a security training certification is valid per HIPAA § 164.308(a)(5). After expiry, certain operations may be restricted depending on the training enforcement implementation.

---

## Monitoring & Observability

### How do I access Prometheus metrics?

```bash
curl -u "$METRICS_USERNAME:$METRICS_PASSWORD" http://localhost:3001/metrics
```

If `METRICS_USERNAME` and `METRICS_PASSWORD` are not set (development), the endpoint is open. In production, always set both.

---

### Why are my errors not showing up in Sentry?

1. `SENTRY_DSN` must be set — check startup log.
2. 4xx errors (client errors) are **intentionally not sent to Sentry** — only unhandled 5xx exceptions are tracked.
3. `instrument.ts` must be imported before any other module in `app.ts` for Sentry to instrument correctly.
4. Check Sentry's ingest quota — if the project is over quota, events are dropped.

---

### How do I trace a specific request end-to-end?

Every request gets a `requestId` UUID (set by `correlationMiddleware`). It appears:
- In the error response body.
- In every Pino log line for that request.
- As a Sentry event tag.
- As an OpenTelemetry trace attribute (if `OTEL_EXPORTER_OTLP_ENDPOINT` is set).
- In the `X-Request-ID` response header (exposed via CORS).

```bash
# Find all log lines for a request
jq 'select(.requestId == "abc-123")' /var/log/api/app.log
```

---

### How do I change the log level without restarting?

If the admin endpoint is implemented:
```bash
curl -X PATCH \
  -H "Authorization: Bearer <superAdminToken>" \
  -H "Content-Type: application/json" \
  -d '{"level": "debug"}' \
  http://localhost:3001/api/v2/admin/log-level
```

Otherwise, set `LOG_LEVEL=debug` and restart. Valid levels: `debug`, `info`, `warn`, `error`.

---

## Deployment & DevOps

### How do I build the production Docker image?

```bash
# From the monorepo root
docker build \
  -f apps/api/Dockerfile.prod \
  -t health-watchers-api:latest \
  .
```

The production Dockerfile is `Dockerfile.prod`. The regular `Dockerfile` is for development (includes devDependencies and ts-node-dev).

---

### Why does the container keep restarting?

Check exit code and logs:
```bash
docker inspect health-watchers-api --format '{{.State.ExitCode}}'
docker logs health-watchers-api --tail 30
```

Exit code `1` = intentional shutdown (env validation, HIPAA check, DB failure).
Exit code `137` = OOM killed — increase container memory limit.
Exit code `143` = SIGTERM (graceful shutdown triggered by orchestrator).

---

### How long does graceful shutdown take?

The shutdown sequence: stop accepting requests → drain connections → stop background jobs → close DB.

Background jobs are stopped in this order: `paymentExpiration`, `reconciliation`, `riskRecalculation`, `balanceMonitoring`, `waitlistExpiry`, `appointmentReminder`, `claimableExpiryNotification`, `xlmRate`, `mfaGracePeriod`, `followUpReminder`, `retryWorker`.

Typical shutdown: 2–5 seconds. Set `terminationGracePeriodSeconds: 30` in Kubernetes to be safe.

---

### How do I run the API locally without Docker?

```bash
# Prerequisites: Node.js (see .nvmrc), MongoDB running locally

cd apps/api
cp ../../.env.example .env
# Edit .env with your values

npm install
npm run dev
# Server starts on http://localhost:3001
```

---

## Developer Workflow

### How do I create a changeset for my PR?

```bash
# From monorepo root
npx changeset add
# Follow the prompts: select packages changed, bump type (patch/minor/major), describe the change
# Commit the generated file in .changeset/
```

The `changeset-check.yml` CI workflow blocks PRs without a changeset.

---

### What commit message format is required?

Conventional Commits: `<type>(<scope>): <description>`

```
feat(auth): add MFA backup code regeneration
fix(payments): handle expired refund window correctly
docs(api): update environment variable reference
chore(deps): bump mongoose to 8.5.1
```

Valid types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `test`, `perf`, `ci`, `build`, `revert`.

The `commitlint.yml` CI workflow and the `.husky/commit-msg` hook enforce this.

---

### My pre-commit hook is blocking my commit. How do I debug it?

```bash
# Run hooks manually to see full output
npx lint-staged          # linting + formatting
npx commitlint --edit    # commit message check

# If the secrets scanner is blocking:
# Check .gitleaks.toml for allowed patterns
# Add // gitleaks:allow on the offending line if it's a false positive
```

---

### How do I add a new environment variable?

1. Add it to `.env.example` with a descriptive comment.
2. Add the Zod schema entry in `apps/api/src/config/env.ts` with appropriate validation.
3. Export it from `env` object if needed: `export const env = result.data`.
4. Add it to `apps/api/docs/environment-variables.md`.
5. Add HIPAA compliance checks if it relates to PHI, encryption, or access control.

---

### How do I add a new background job?

1. Create the job in `apps/api/src/jobs/<name>.job.ts` — export `startXJob()` and `stopXJob()`.
2. Import and call `startXJob()` in `app.ts` after DB connection.
3. Add `stopXJob()` to the `stopJobs` array in `registerGracefulShutdown()` in `app.ts`.
4. Log start/stop events with a consistent `[job-name]` prefix for grep-ability.

---

### What testing commands are available?

```bash
# Unit + integration tests (single run, no watch)
npm run test

# Coverage report
npm run test:coverage

# Type checking only (no emit)
npm run typecheck

# Lint
npm run lint

# Format check
npm run format:check
```

Do not use `jest --watch` or `vitest` watch mode in CI — use the `--run` flag for single-pass execution.
