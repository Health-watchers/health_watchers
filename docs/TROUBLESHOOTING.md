# Troubleshooting Guide

Common issues encountered when running, developing, or deploying Health Watchers, with solutions, debug steps, and a support escalation process.

---

## Table of Contents

- [MongoDB Connection Errors](#mongodb-connection-errors)
- [JWT Authentication Failures](#jwt-authentication-failures)
- [Stellar / Blockchain Errors](#stellar--blockchain-errors)
- [Build Failures](#build-failures)
- [Docker Issues](#docker-issues)
- [E2E Test Failures](#e2e-test-failures)
- [Environment Variable Issues](#environment-variable-issues)
- [Performance Issues](#performance-issues)
- [Rate Limiting Issues](#rate-limiting-issues)
- [Migration Errors](#migration-errors)
- [Common API Errors](#common-api-errors)
- [Debug Tips](#debug-tips)
- [Support Process](#support-process)

---

## MongoDB Connection Errors

### `MongoServerSelectionError: connect ECONNREFUSED`

**Cause**: MongoDB is not running or `MONGO_URI` points to the wrong host/port.

**Solution**:

```bash
# Start MongoDB via Docker Compose (recommended)
docker-compose -f docker-compose.dev.yml up -d

# Or start a local mongod instance
mongod --dbpath /data/db
```

Verify `MONGO_URI` in your `.env` matches the running instance:

```env
MONGO_URI=mongodb://localhost:27017/health_watchers
```

Check that MongoDB is accepting connections:

```bash
mongosh mongodb://localhost:27017 --eval "db.adminCommand({ ping: 1 })"
```

---

### Replica set errors in development

**Error**: `Transaction requires a replica set`

**Cause**: Transactions and change streams require a replica set, which the default single-node Docker setup does not provide.

**Solution**: Use the replica-set Compose file:

```bash
docker-compose -f docker-compose.mongodb-replica.yml up -d
```

---

### `Authentication failed` when connecting

**Cause**: The username/password in `MONGO_URI` does not match the database user.

**Solution**: Check that `MONGO_URI` follows the format below and the user exists in MongoDB:

```bash
# URI format
mongodb://username:password@host:27017/dbname

# Verify user exists
mongosh mongodb://localhost:27017/admin --eval "db.getUsers()"
```

---

### `MongoPoolClosedError: Attempted to check out a connection from closed connection pool`

**Cause**: The API process attempted a database operation after receiving a shutdown signal.

**Solution**: This is benign during graceful shutdown. If it occurs outside of a shutdown event, it indicates the DB connection was closed prematurely. Restart the API and check for `connectDB` errors in startup logs.

---

## JWT Authentication Failures

### `JsonWebTokenError: invalid signature`

**Cause**: `JWT_ACCESS_TOKEN_SECRET` changed after tokens were issued, invalidating all existing tokens.

**Solution**: Clear cookies and `localStorage` in the browser, then log in again. In development, keep the JWT secrets stable across server restarts.

---

### `TokenExpiredError: jwt expired`

**Cause**: The access token lifetime has elapsed (default: 15 minutes).

**Solution**: The frontend automatically refreshes tokens via `POST /api/v1/auth/refresh`. If refresh is failing:

1. Verify the `refreshToken` cookie is present in the browser DevTools → Application → Cookies.
2. Confirm `JWT_REFRESH_TOKEN_SECRET` is set in `.env`.
3. Check the API logs for `refresh` route errors.

---

### `401 Unauthorized` on every request

**Debug steps**:

1. Open browser DevTools → Network tab → confirm the `Authorization: Bearer <token>` header is present on the failing request.
2. Decode the token at [jwt.io](https://jwt.io) to inspect the `exp` claim and role/clinic information.
3. Confirm the API's `JWT_ACCESS_TOKEN_SECRET` matches the value used to sign the token.
4. Verify the user is active (`isActive: true`) in the database.

---

### MFA-related `403 Forbidden`

**Cause**: DOCTOR or NURSE accounts are required to complete MFA setup before the MFA grace period expires. If MFA is not configured by the deadline, access is restricted.

**Solution**:

1. Log in with valid credentials.
2. Follow the MFA setup flow to register a TOTP authenticator app.
3. Enter the 6-digit TOTP code to verify setup.

If the grace period has already expired, a `CLINIC_ADMIN` or `SUPER_ADMIN` can reset the grace period from the admin panel.

---

## Stellar / Blockchain Errors

### `stellar-service: connection refused`

**Cause**: The `stellar-service` process is not running.

**Solution**:

```bash
# Start via npm (development)
npm run dev --workspace=stellar-service

# Or via Docker Compose
docker-compose up stellar-service
```

---

### `NetworkError: Unable to reach Horizon`

**Cause**: `STELLAR_NETWORK` is misconfigured or the Horizon endpoint is unreachable.

**Solution**: Set `STELLAR_NETWORK=testnet` for development. Test connectivity:

```bash
curl https://horizon-testnet.stellar.org
# Should return a JSON object with network info
```

Ensure `STELLAR_HORIZON_URL` in `.env` is set to `https://horizon-testnet.stellar.org` for testnet.

---

### `Transaction failed: insufficient balance`

**Cause**: The Stellar account has insufficient XLM to cover the base fee or minimum reserve.

**Solution**: Fund the testnet account using Friendbot:

```bash
curl "https://friendbot.stellar.org?addr=<YOUR_PUBLIC_KEY>"
```

For mainnet, transfer XLM to the account from an exchange or wallet.

---

### `Transaction submission timed out`

**Cause**: The Horizon server is congested or the network is experiencing high load.

**Solution**:

1. Check the Stellar network status at [dashboard.stellar.org](https://dashboard.stellar.org).
2. The stellar-service has built-in retry logic with exponential back-off. Check `stellar-service` logs for retry attempts.
3. If the payment is stuck in `processing` state, the reconciliation job (`startReconciliationJob`) will attempt to resolve it automatically on its next cycle.

---

## Build Failures

### `Type error: Cannot find module '@health-watchers/types'`

**Cause**: Shared packages must be built before consuming apps.

**Solution**:

```bash
# Build shared packages first
npm run build --workspace=packages/types

# Then build the consuming app
npm run build --workspace=web

# Or use Turborepo which resolves build order automatically
npx turbo build
```

---

### `next build` fails with missing `NEXT_PUBLIC_*` variable

**Cause**: Public environment variables are inlined at build time, not injected at runtime. They must be present when running `next build`.

**Solution**: Set the variable in `.env.local` or inline it at build time:

```bash
NEXT_PUBLIC_API_URL=https://api.healthwatchers.com npm run build --workspace=web
```

---

### ESLint errors blocking the build

**Cause**: The project enforces a zero-warning ESLint policy in CI — warnings are treated as errors.

**Solution**: Run lint locally and fix all reported issues before pushing:

```bash
npm run lint --workspace=web
npm run lint --workspace=api
```

---

### TypeScript type errors after pulling new changes

**Cause**: A new version of a shared package changed its types.

**Solution**:

```bash
# Rebuild all packages in dependency order
npx turbo build

# Then rerun typecheck
npm run typecheck
```

---

## Docker Issues

### `Bind for 0.0.0.0:PORT failed: port is already allocated`

**Cause**: Another process is already using that port.

**Solution**: Find and stop the conflicting process:

```bash
# Find the process using port 3000
lsof -i :3000

# Kill it
kill <PID>

# Or on all platforms
npx kill-port 3000
```

---

### Containers exit immediately after starting

**Solution**: Inspect logs for the specific error:

```bash
docker-compose logs api
docker-compose logs web
docker-compose logs mongo
```

Common causes:
- Missing required environment variables.
- MongoDB not ready yet (health check may need more time — add `depends_on` with `condition: service_healthy`).
- Port conflict with a host process.
- Failed build step — rebuild images with `docker-compose build --no-cache`.

---

### `EACCES: permission denied` in a Docker volume

**Cause**: File ownership mismatch between the host filesystem and the container user.

**Solution**:

```bash
# Remove volumes and restart
docker-compose down -v
docker-compose up --build
```

---

### Changes to source files not reflected in the container

**Cause**: Docker image is cached and the container is running stale code.

**Solution**:

```bash
# Force a rebuild
docker-compose build --no-cache api
docker-compose up api
```

---

## E2E Test Failures

### `Error: page.goto: net::ERR_CONNECTION_REFUSED`

**Cause**: The web or API server is not running when Playwright starts.

**Solution**: Start both servers and wait for them before running tests:

```bash
npm run dev --workspace=api &
npm run dev --workspace=web &
npx wait-on http://localhost:3001/health http://localhost:3000
npm run test:e2e --workspace=web
```

---

### Visual regression snapshot mismatch

**Cause**: An intentional UI change broke a stored screenshot baseline, or a rendering difference between environments.

**Solution**:

1. Open the Playwright HTML report to review the visual diff.
2. If the change is intentional, update the baselines:

```bash
npx playwright test --update-snapshots
git add apps/web/e2e/*.png
git commit -m "chore: update visual regression baselines"
```

---

### Tests pass locally but fail in CI

**Debug steps**:

1. Download the `playwright-report` artifact from the failed workflow run in GitHub Actions.
2. Open the HTML report to view screenshots and traces for the failing test.
3. Check for **timing issues** — the CI environment is slower; increase `timeout` in `playwright.config.ts` if tests are timing out consistently.
4. Confirm that `E2E_DOCTOR_EMAIL`, `E2E_DOCTOR_PASSWORD`, `E2E_ADMIN_EMAIL`, and `E2E_ADMIN_PASSWORD` secrets are configured in GitHub repository settings under **Settings → Secrets and variables → Actions**.
5. Check for **flakiness** caused by network calls or animations. Use `page.waitForSelector` or `expect.toBeVisible` instead of fixed `page.waitForTimeout` delays.

---

### Playwright browser not installed

**Error**: `Error: browserType.launch: Executable doesn't exist`

**Solution**:

```bash
npx playwright install --with-deps chromium
```

---

## Environment Variable Issues

### `Error: Missing required environment variable`

**Solution**: Copy the example file and fill in all required values:

```bash
cp .env.example .env
# Edit .env with your configuration
```

See `.env.example` for descriptions of each variable. Required variables are validated at startup by `apps/api/src/config/env.ts` — the API will refuse to start if they are missing.

---

### Next.js does not expose my variable to the browser

**Cause**: Variables available in the browser must be prefixed with `NEXT_PUBLIC_`. Unprefixed variables are only available in server-side code.

**Solution**: Rename `MY_VAR` to `NEXT_PUBLIC_MY_VAR` in `.env` and rebuild:

```bash
# Wrong — not accessible in browser
MY_API_URL=https://api.healthwatchers.com

# Correct — accessible in browser
NEXT_PUBLIC_API_URL=https://api.healthwatchers.com
```

Server-only secrets (e.g. `JWT_ACCESS_TOKEN_SECRET`, `MONGO_URI`) must remain unprefixed.

---

## Performance Issues

### API response times exceed 500 ms

**Debug steps**:

1. Enable MongoDB slow query logging to find expensive queries:

```bash
mongosh mongodb://localhost:27017/health_watchers --eval \
  "db.setProfilingLevel(1, { slowms: 100 })"
```

2. Review the slow query log:

```bash
mongosh mongodb://localhost:27017/health_watchers --eval \
  "db.system.profile.find().sort({ ts: -1 }).limit(10).pretty()"
```

3. Run `explain()` on slow queries to check index usage:

```javascript
db.patients.find({ clinicId: ObjectId('...') }).sort({ createdAt: -1 }).explain('executionStats');
```

4. Check Prometheus metrics at `http://localhost:9090` when the monitoring stack is running:

```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

---

### High memory usage in the Node.js API process

**Debug steps**:

```bash
# Start the API with the V8 inspector enabled
node --inspect apps/api/dist/main.js
```

Open `chrome://inspect` in Chrome, connect to the process, and use the Memory tab to take heap snapshots and identify leaks.

Alternatively, enable heap profiling in development:

```bash
NODE_OPTIONS="--max-old-space-size=512" npm run dev --workspace=api
```

---

## Rate Limiting Issues

### `429 Too Many Requests` unexpectedly

**Cause**: Either a limiter is firing correctly (genuine overuse), or your IP is shared with other users and the per-IP limit is being consumed.

**Debug steps**:

1. Check the `RateLimit-Remaining` and `Retry-After` headers in the response.
2. Wait for the `Retry-After` value (in seconds) before retrying.
3. Check the Prometheus metric `rate_limit_hits_total` to identify which limiter is firing.

**Solution**: Implement exponential back-off using the `Retry-After` header. See [API_RATE_LIMITING.md](./API_RATE_LIMITING.md) for client-side retry code examples.

---

### Rate limits not resetting across API replicas

**Cause**: Rate limiting state is stored in-memory by default. Each API replica has an independent counter, so limits are not shared across replicas.

**Solution**: Configure Redis to share state:

```env
REDIS_URL=redis://redis:6379
```

See [API_RATE_LIMITING.md — Storage Backend](./API_RATE_LIMITING.md#storage-backend) for full configuration details.

---

## Migration Errors

### `migrate:up` fails with `duplicate key error`

**Cause**: A previous partial migration run created some indexes that already exist.

**Solution**: All migrations use named indexes with idempotent `createIndex`. If you encounter this error, check whether the index already exists:

```bash
mongosh mongodb://localhost:27017/health_watchers --eval \
  "db.patients.getIndexes()"
```

If the index already exists with the correct key pattern, the migration likely ran partially. Drop the index manually and re-run the migration, or mark it as applied in the `changelog` collection.

---

### `migrate:down` deletes data unexpectedly

**Cause**: A migration's `down` function was written to drop a collection rather than just revert schema changes.

**Solution**: Review the migration file before running `migrate:down`. The `down` function should only reverse the structural change (drop indexes, remove fields), not delete data. If data loss has occurred, restore from backup — see [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md).

---

## Common API Errors

| HTTP Status | `error` field | Common cause |
|-------------|--------------|-------------|
| `400` | `ValidationError` | Request body failed Joi/Zod validation — check the `details` array in the response |
| `401` | `Unauthorized` | Missing or invalid JWT access token |
| `403` | `Forbidden` | Valid token but insufficient role/permissions |
| `404` | `NotFound` | Resource does not exist or belongs to a different clinic |
| `409` | `Conflict` | Duplicate record (e.g. duplicate patient `systemId`, duplicate email) |
| `415` | `UnsupportedMediaType` | `Content-Type` header is not `application/json` on a POST/PUT/PATCH |
| `429` | `TooManyRequests` | Rate limit exceeded — check `Retry-After` header |
| `500` | `InternalServerError` | Unexpected server error — check API logs for stack trace |

---

## Debug Tips

| Technique | How |
|-----------|-----|
| Verbose API logs | Set `LOG_LEVEL=debug` in `.env` |
| Mongoose query logging | Set `MONGOOSE_DEBUG=true` in `.env` |
| Full Playwright traces | `npx playwright test --trace on` → open with `npx playwright show-trace trace.zip` |
| Intercept network in E2E | `page.route('**/api/**', route => { console.log(route.request().url()); route.continue(); })` |
| Decode a JWT | Paste at [jwt.io](https://jwt.io) to inspect claims without needing the secret |
| Inspect a running container | `docker-compose exec api sh` |
| Watch MongoDB operations live | `mongosh mongodb://localhost:27017/health_watchers --eval "db.setProfilingLevel(2)"` then query `system.profile` |
| Test rate limiting locally | Use `artillery` or `k6` to fire N requests quickly |
| Check Redis rate limit state | `redis-cli -u $REDIS_URL KEYS "ratelimit:*"` |

---

## Support Process

1. **Search existing issues** in the [GitHub repository](https://github.com/Health-watchers/health_watchers/issues) — the problem may already be documented or fixed.

2. **Gather information** before opening a report:
   - Node.js version: `node --version`
   - npm version: `npm --version`
   - Full error message and stack trace (from API logs or browser console)
   - Exact steps to reproduce
   - Environment: local dev / Docker / CI / staging / production

3. **Open a GitHub issue** using the bug report template. Include:
   - Relevant log snippets (redact any tokens or secrets)
   - Your `.env` with all secret values replaced by `<REDACTED>`
   - The exact command or request that triggered the error

4. **Security vulnerabilities**: do **not** open a public GitHub issue. Follow the responsible disclosure process in [SECURITY.md](../SECURITY.md). Contact the security team at `security@healthwatchers.com`.

5. **Urgent production incidents**: contact the on-call engineer via the escalation path in your team's runbook (see `monitoring/runbooks/`). For API downtime, refer to [API_DOWN.md](../monitoring/runbooks/API_DOWN.md). For database failures, refer to [MONGODB_PRIMARY_DOWN.md](../monitoring/runbooks/MONGODB_PRIMARY_DOWN.md).

6. **General questions**: reach out via `support@healthwatchers.com` or open a [GitHub Discussion](https://github.com/Health-watchers/health_watchers/discussions).
