# Troubleshooting Guide

Common issues encountered when running, developing, or deploying Health Watchers, with solutions and debug steps.

## Table of Contents

- [MongoDB Connection Errors](#mongodb-connection-errors)
- [JWT Authentication Failures](#jwt-authentication-failures)
- [Stellar / Blockchain Errors](#stellar--blockchain-errors)
- [Build Failures](#build-failures)
- [Docker Issues](#docker-issues)
- [E2E Test Failures](#e2e-test-failures)
- [Environment Variable Issues](#environment-variable-issues)
- [Performance Issues](#performance-issues)
- [Debug Tips](#debug-tips)
- [Support Process](#support-process)

---

## MongoDB Connection Errors

### `MongoServerSelectionError: connect ECONNREFUSED`

**Cause**: MongoDB is not running or `MONGO_URI` points to the wrong host/port.

**Solution**:
```bash
# Start MongoDB via Docker Compose
docker-compose up -d mongo

# Or start a local mongod instance
mongod --dbpath /data/db
```

Verify `MONGO_URI` in your `.env` matches the running instance (default: `mongodb://localhost:27017/health_watchers`).

### Replica set errors in development

**Cause**: Transactions and change streams require a replica set, which the default single-node setup does not provide.

**Solution**: Use the replica-set Compose file:
```bash
docker-compose -f docker-compose.mongodb-replica.yml up -d
```

### `Authentication failed` when connecting

**Cause**: Username/password in `MONGO_URI` does not match the database user.

**Solution**: Check that `MONGO_URI` follows `mongodb://user:password@host:27017/dbname` and that the user exists in MongoDB with the correct role.

---

## JWT Authentication Failures

### `JsonWebTokenError: invalid signature`

**Cause**: `JWT_ACCESS_TOKEN_SECRET` changed after tokens were issued, invalidating all existing tokens.

**Solution**: Clear cookies and `localStorage` in the browser, then log in again. In development, keep secrets stable across server restarts.

### `TokenExpiredError: jwt expired`

**Cause**: Access token lifetime has elapsed (default: 15 minutes).

**Solution**: The frontend automatically refreshes tokens via `POST /api/v1/auth/refresh`. If refresh is failing, verify the refresh token cookie is being sent and that `JWT_REFRESH_TOKEN_SECRET` is set correctly.

### `401 Unauthorized` on every request

**Debug steps**:
1. Open browser DevTools → Network tab → confirm `Authorization: Bearer <token>` header is present.
2. Decode the token at [jwt.io](https://jwt.io) to inspect expiry (`exp`) and claims.
3. Confirm the API's `JWT_ACCESS_TOKEN_SECRET` matches the secret used to sign the token.

---

## Stellar / Blockchain Errors

### `stellar-service: connection refused`

**Cause**: The `stellar-service` process is not running.

**Solution**:
```bash
npm run dev --workspace=stellar-service
# or
docker-compose up stellar-service
```

### `NetworkError: Unable to reach Horizon`

**Cause**: `STELLAR_NETWORK` is misconfigured or the Horizon endpoint is unreachable.

**Solution**: Set `STELLAR_NETWORK=testnet` for development. The testnet Horizon URL is `https://horizon-testnet.stellar.org`. Check connectivity with:
```bash
curl https://horizon-testnet.stellar.org
```

### `Transaction failed: insufficient balance`

**Cause**: The Stellar account has no XLM to cover the base fee or reserve.

**Solution**: Fund the testnet account using Friendbot:
```bash
curl "https://friendbot.stellar.org?addr=<YOUR_PUBLIC_KEY>"
```

---

## Build Failures

### `Type error: Cannot find module '@health-watchers/types'`

**Cause**: Shared packages must be built before consuming apps.

**Solution**:
```bash
# Build shared packages first, then the app
npm run build --workspace=packages/types
npm run build --workspace=web
```

Alternatively, use Turborepo which resolves build order automatically:
```bash
npx turbo build
```

### `next build` fails with missing `NEXT_PUBLIC_*` variable

**Cause**: Public environment variables must be present at build time, not just runtime.

**Solution**: Set the variable in `.env.local` or inline it:
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run build --workspace=web
```

### ESLint errors blocking the build

**Cause**: The project enforces a zero-warning ESLint policy; warnings are treated as errors in CI.

**Solution**: Run lint locally and fix all reported issues before pushing:
```bash
npm run lint --workspace=web
```

---

## Docker Issues

### `Bind for 0.0.0.0:PORT failed: port is already allocated`

**Cause**: Another process is already using that port.

**Solution**: Find and stop the conflicting process:
```bash
lsof -i :3000   # replace with the conflicting port
kill <PID>
```

### Containers exit immediately after starting

**Solution**: Inspect logs for the specific error:
```bash
docker-compose logs api
docker-compose logs web
```

Common causes: missing environment variables, database not ready, failed health check.

### `EACCES: permission denied` in a Docker volume

**Cause**: File ownership mismatch between host and container.

**Solution**:
```bash
docker-compose down -v   # removes volumes
docker-compose up --build
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

### Visual regression snapshot mismatch

**Cause**: An intentional UI change broke a stored screenshot baseline, or a flaky rendering difference.

**Solution**: Open the Playwright HTML report to review the diff. If the change is intentional, update baselines:
```bash
npx playwright test --update-snapshots
```

Commit the updated `*.png` files alongside your code changes.

### Tests pass locally but fail in CI

**Debug steps**:
1. Download the `playwright-report` artifact from the failed workflow run.
2. Open the HTML report to view screenshots and traces for the failing test.
3. Check for timing issues — the CI environment is slower; increase `timeout` in `playwright.config.ts` if needed.
4. Confirm that `E2E_DOCTOR_EMAIL`, `E2E_DOCTOR_PASSWORD`, `E2E_ADMIN_EMAIL`, and `E2E_ADMIN_PASSWORD` secrets are configured in the GitHub repository settings.

---

## Environment Variable Issues

### `Error: Missing required environment variable`

**Solution**: Copy the example file and fill in all required values:
```bash
cp .env.example .env
```

See `.env.example` for descriptions of each variable.

### Next.js does not expose my variable to the browser

**Cause**: Browser-accessible variables must be prefixed with `NEXT_PUBLIC_`.

**Solution**: Rename `MY_VAR` to `NEXT_PUBLIC_MY_VAR` in your `.env` and rebuild the app. Server-only variables should remain unprefixed.

---

## Performance Issues

### API response times exceed 500 ms

**Debug steps**:
1. Enable MongoDB slow query logging: `db.setProfilingLevel(1, { slowms: 100 })`.
2. Run `explain()` on slow queries to identify missing indexes.
3. Check Prometheus metrics at `http://localhost:9090` (when the monitoring stack is running via `docker-compose.monitoring.yml`).

### High memory usage in the Node.js API process

**Debug steps**:
```bash
# Start the API with the inspector enabled
node --inspect apps/api/dist/main.js
```

Open `chrome://inspect` in Chrome, connect to the process, and use the Memory tab to take heap snapshots and find leaks.

---

## Debug Tips

| Technique | How |
|---|---|
| Verbose API logs | Set `LOG_LEVEL=debug` in `.env` |
| Mongoose query logging | Set `MONGOOSE_DEBUG=true` in `.env` |
| Full Playwright traces | Run `npx playwright test --trace on`; open with `npx playwright show-trace trace.zip` |
| Intercept network calls in E2E | Use `page.route()` to log or mock API responses |
| Decode a JWT without a secret | Paste the token at [jwt.io](https://jwt.io) to inspect claims |
| Inspect a running container | `docker-compose exec api sh` |

---

## Support Process

1. **Search existing issues** in the GitHub repository — the problem may already be documented or fixed.
2. **Gather information** before opening a report:
   - Node.js version: `node --version`
   - Full error message and stack trace
   - Exact steps to reproduce
   - Environment: local dev / Docker / CI / staging / production
3. **Open a GitHub issue** using the bug report template. Attach relevant log snippets.
4. **Security vulnerabilities**: do **not** open a public issue. Follow the responsible disclosure process in [SECURITY.md](../SECURITY.md).
5. **Urgent production incidents**: contact the on-call engineer via the escalation path in your team's runbook.
