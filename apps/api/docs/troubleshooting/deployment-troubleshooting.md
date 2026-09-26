# Deployment Troubleshooting

Covers startup failures, Docker issues, CI/CD pipeline problems, HIPAA compliance warnings, and environment-specific configuration.

---

## Table of Contents

- [Startup Failures](#startup-failures)
- [HIPAA Compliance Warnings](#hipaa-compliance-warnings)
- [Docker Issues](#docker-issues)
- [Environment Configuration Problems](#environment-configuration-problems)
- [CI/CD Pipeline Failures](#cicd-pipeline-failures)
- [Rolling Deployment Issues](#rolling-deployment-issues)
- [Health Check Failures](#health-check-failures)
- [Graceful Shutdown Issues](#graceful-shutdown-issues)
- [Production Deployment Checklist](#production-deployment-checklist)

---

## Startup Failures

### Server exits immediately with code 1

The most common causes of an immediate `process.exit(1)`:

**1. Environment validation failed** (most common)

```
❌ Environment validation failed:
+---------------------+-----------------------------------------+
| Variable            | Issue                                   |
+---------------------+-----------------------------------------+
| MONGO_URI           | Missing required env var: MONGO_URI     |
+---------------------+-----------------------------------------+
```

Fix: Set every variable listed. See [ERR-001](./common-errors.md#err-001--environment-validation-failed-at-startup).

**2. `FIELD_ENCRYPTION_KEY` missing in production**

```
🚨 HIPAA VIOLATION: FIELD_ENCRYPTION_KEY is not set in production.
```

Fix: Generate and set a 64-char hex AES-256 key. See [ERR-002](./common-errors.md#err-002--field_encryption_key-missing-in-production-hard-exit).

**3. MongoDB connection failed after all retries**

```
MongoDB connection failed after max retries
Process exited with code 1
```

Fix: Verify `MONGO_URI` is reachable. The server retries 5 times with exponential backoff (1s, 2s, 4s, 8s, 16s) before giving up.

**4. `MONGO_URI` not set in `@health-watchers/config`**

```
MONGO_URI is not set
Process exited with code 1
```

This check is in `config/db.ts`. The shared config package also reads `MONGO_URI` — ensure it's visible in the environment when the package initializes.

### Server starts but returns 503 immediately

The process is up but the readiness probe fails.

Check: `GET /health/ready`

```json
{
  "status": "error",
  "checks": {
    "database": "disconnected",
    "redis": "connected"
  }
}
```

Fix the failing dependency (usually MongoDB).

### Import order errors at startup

```
Error: Cannot read properties of undefined (reading 'mongoUri')
```

`app.ts` must import in this order:
1. `./tracing` — OpenTelemetry SDK (must be first)
2. `./instrument` — Sentry (must be second)
3. `./config/env` — Zod env validation (must be third)

Any other module that accesses `process.env` before `env.ts` runs may see undefined values.

---

## HIPAA Compliance Warnings

These warnings appear in the startup log and indicate compliance gaps that should be resolved before treating real patient data.

### `FIELD_ENCRYPTION_KEY` not set (hard exit in production)

**Impact:** PHI stored in plaintext. HIPAA § 164.312(a)(2)(iv) violation.

**Fix:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Set output as FIELD_ENCRYPTION_KEY (64-char hex string)
```

### `AUDIT_ENCRYPTION_KEY` not set (warning)

**Impact:** Audit log metadata not encrypted at rest. HIPAA § 164.312(b) partial gap.

**Fix:** Same key generation as above. Store in secret manager.

### `BACKUP_ENCRYPTION_KEY` not set (warning)

**Impact:** Database backups not encrypted. HIPAA § 164.312(c)(1) gap.

**Fix:**
```bash
openssl rand -base64 32
# Set output as BACKUP_ENCRYPTION_KEY (min 32 chars)
```

### `SMTP_HOST` not set (warning)

**Impact:** Automated breach notification emails (HIPAA § 164.410) cannot be sent.

**Fix:** Configure SMTP or SendGrid. See [ERR-040](./common-errors.md#err-040--password-reset-email-not-received).

### `REDIS_URL` not set in production (warning → should be hard exit)

**Impact:** Rate limiting is per-pod. Distributed brute-force attacks are possible.

**Fix:** Set `REDIS_URL`. See [ERR-003](./common-errors.md#err-003--redis_url-not-set-in-production).

> Note: This is currently a warning, not a hard exit. It will be upgraded to a hard exit in a future release. Treat it as mandatory.

---

## Docker Issues

### Container fails health check and restarts

Docker Compose health check (or Kubernetes liveness probe) calls `/health/live`. If it fails, the container restarts.

**Diagnose:**
```bash
docker logs health-watchers-api --tail 100

# Check health endpoint from inside the container
docker exec health-watchers-api curl -s http://localhost:4000/health/live
```

**Common causes:**
- MongoDB not yet ready when the API container starts — use `depends_on` with `condition: service_healthy` in `docker-compose.yml`.
- `MONGO_URI` points to `localhost` inside a Docker container — use the service name instead: `mongodb://mongo:27017/health_watchers`.

### `ECONNREFUSED` connecting to MongoDB from Docker

```
MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017
```

**Cause:** `localhost` inside a Docker container refers to the container itself, not the host.

**Fix:** Use the Docker Compose service name:
```bash
MONGO_URI=mongodb://mongo:27017/health_watchers
```
Or use `host.docker.internal` (Mac/Windows Docker Desktop) to reach the host machine.

### Port not exposed

```
Error: connect ECONNREFUSED 0.0.0.0:4000
```

**Fix:** Ensure the port is exposed in `docker-compose.yml`:
```yaml
ports:
  - "4000:4000"
```
And the correct port is mapped (`API_PORT` env var, default `4000` as set in `app.ts`).

### `.env` file not loaded in Docker

Docker does not automatically load `.env` files. You must either:

**Option A** — Use `env_file` in `docker-compose.yml`:
```yaml
env_file:
  - .env
```

**Option B** — Pass individual vars:
```yaml
environment:
  - MONGO_URI=${MONGO_URI}
  - JWT_ACCESS_TOKEN_SECRET=${JWT_ACCESS_TOKEN_SECRET}
```

**Option C** — Use secrets management (recommended for production):
```yaml
secrets:
  - mongo_uri
```

### Build fails: `Cannot find module`

```
Error: Cannot find module '@health-watchers/config'
```

**Cause:** Docker build context does not include the monorepo root `packages/` directory.

**Fix:** Ensure the Dockerfile uses the monorepo root as the build context:
```dockerfile
# In docker-compose.yml
build:
  context: ../..     # monorepo root
  dockerfile: apps/api/Dockerfile
```

---

## Environment Configuration Problems

### Different behavior between environments

If the API behaves differently in staging vs production:

1. Dump and compare non-secret env vars:
```bash
# On each environment
printenv | grep -v -E 'SECRET|KEY|PASS|TOKEN' | sort > env-staging.txt
diff env-staging.txt env-prod.txt
```

2. Check `NODE_ENV` — this controls several behaviors:
   - Stack traces in error responses (dev only)
   - HIPAA hard-exits (prod only)
   - `trust proxy` setting (auto-enabled in prod)
   - Pino health-check log suppression (prod only)

### `ALLOWED_ORIGINS` missing the frontend

```
CORS: origin 'https://app.yourdomain.com' not allowed
```

**Fix:**
```bash
ALLOWED_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com
```
Comma-separated, no trailing slashes, no spaces around commas.

### `TRUST_PROXY` misconfigured

**Symptom:** Rate limiting applies to the load balancer's IP instead of the real client IP, meaning all users share the same rate limit counter.

**Cause:** `TRUST_PROXY` not set, so `req.ip` returns the proxy's IP.

**Fix:**
```bash
# If behind 1 reverse proxy (nginx/ALB/Cloudflare):
TRUST_PROXY=1

# If multiple hops:
TRUST_PROXY=2

# To disable (direct connections only):
TRUST_PROXY=false
```

### JWT issuer/audience mismatch after environment copy

After copying a staging database to production (or vice versa), tokens signed with different `JWT_ISSUER`/`JWT_AUDIENCE` values will be rejected.

**Fix:** Rotate JWT secrets when promoting a database across environments. All users will need to re-authenticate.

---

## CI/CD Pipeline Failures

### Changeset check fails (`changeset-check.yml`)

```
Error: No changeset found for this PR
```

**Fix:** Run `npx changeset add` and commit the generated file in `.changeset/`.

### Commitlint fails

```
✖ subject may not be empty
✖ type must be one of [feat, fix, chore, docs, style, refactor, test, perf, ci, build, revert]
```

**Fix:** Follow Conventional Commits format:
```
feat(auth): add MFA backup code regeneration
fix(payments): handle expired refund window
docs(api): update environment variable reference
```

### Secrets scanning blocks commit (`pre-commit-secrets`)

```
[WARNING] Possible secret detected: JWT_SECRET
```

**Fix:** Remove the secret from the staged file. Use environment variables or a `.env` file (which is gitignored). Add a `gitleaks:allow` comment for intentional test fixtures:
```typescript
const TEST_SECRET = "test-only-not-a-real-secret"; // gitleaks:allow
```

### Pre-commit translation check fails (`pre-commit-translations`)

**Symptom:** Commit blocked because new UI strings are not translated.

**Fix:** Add translations for all new i18n keys before committing.

### Docker build workflow fails

```
ERROR [api  5/8] RUN npm ci
```

**Common causes:**
- `package-lock.json` out of sync — run `npm install` locally and commit the lockfile.
- Private package registry authentication missing — ensure `NPM_TOKEN` is set in GitHub Secrets.
- Node.js version mismatch — check `.nvmrc` and align with the Dockerfile base image.

---

## Rolling Deployment Issues

### New pods start before old pods drain

**Symptom:** Requests to rolling-deploying pods get 503 errors during the transition.

**Fix:** Configure a `preStop` hook in Kubernetes to delay shutdown:
```yaml
lifecycle:
  preStop:
    exec:
      command: ["sleep", "10"]
```
And set `terminationGracePeriodSeconds` to at least 30 seconds to allow graceful shutdown to complete.

### JWT secret rotation causes mass logout

**Symptom:** All users are logged out immediately after a rolling deploy where `JWT_ACCESS_TOKEN_SECRET` changed.

**Cause:** Access tokens signed with the old secret are rejected by pods running the new secret.

**Fix for zero-downtime rotation:**
1. Deploy with both old and new secrets — accept tokens signed by either.
2. After all pods have the new secret, remove the old one.
3. Alternatively, schedule rotation during a maintenance window.

### Database migration run on every pod

**Symptom:** Multiple pods run `migrate-mongo up` simultaneously, causing conflicts.

**Fix:** Run migrations as a pre-deployment job (Kubernetes Job or CI step), not in `startServer()`. The `migrationManager` in `app.ts` only tracks status, not execution.

---

## Health Check Failures

### `/health/live` fails

This endpoint only checks that the process is alive. If it fails, the process has likely crashed or is in a deadlock.

**Fix:** Restart the pod/container. Investigate crash logs with `docker logs` or `kubectl logs`.

### `/health/ready` fails

This checks DB and Redis connectivity.

```bash
curl http://localhost:4000/health/ready
```

**If DB shows `disconnected`:**
1. Check `MONGO_URI` is correct.
2. Verify network connectivity to MongoDB.
3. Check MongoDB server logs for auth failures.

**If Redis shows `disconnected`:**
1. Check `REDIS_URL` is correct.
2. Verify Redis is running: `redis-cli -u "$REDIS_URL" PING`

### `/health/startup` fails

Used by Kubernetes `startupProbe` to allow slow startup. If it fails before the server is ready:

**Fix:** Increase `failureThreshold × periodSeconds` in the Kubernetes probe config to give the server more time to start (DB retries take up to 31 seconds: 1+2+4+8+16).

---

## Graceful Shutdown Issues

The app registers `SIGTERM` and `SIGINT` handlers via `registerGracefulShutdown()`. On shutdown:
1. Stop accepting new connections.
2. Drain existing connections.
3. Stop all background jobs (in order).
4. Close MongoDB connection.

### Shutdown takes too long

**Symptom:** Container is force-killed (SIGKILL) before graceful shutdown completes.

**Fix:**
1. Increase `terminationGracePeriodSeconds` in Kubernetes (or `stop_grace_period` in Docker Compose) to at least 30 seconds.
2. Check if a background job is hung — look for `[job-name] stop` log entries.

### Shutdown completes but pod restarts anyway

**Cause:** Kubernetes liveness probe fires during shutdown and kills the pod before graceful shutdown finishes.

**Fix:** Configure the liveness probe with a `preStop` hook delay so it doesn't fire during shutdown.

---

## Production Deployment Checklist

Run this before every production deploy.

```
Environment
[ ] NODE_ENV=production
[ ] JWT_ACCESS_TOKEN_SECRET — set, ≥ 32 chars, not the dev default
[ ] JWT_REFRESH_TOKEN_SECRET — set, ≥ 32 chars, not the dev default
[ ] JWT_TEMP_TOKEN_SECRET — set, ≥ 32 chars (not validated by Zod — verify manually)
[ ] MONGO_URI — correct production Atlas URI, credentials in secret manager
[ ] REDIS_URL — set, TLS URL (rediss://) recommended
[ ] FIELD_ENCRYPTION_KEY — 64-char hex, stored in secret manager
[ ] AUDIT_ENCRYPTION_KEY — 64-char hex, stored in secret manager
[ ] BACKUP_ENCRYPTION_KEY — ≥ 32 chars, stored in secret manager
[ ] SMTP_HOST / SMTP_PASS — configured and tested
[ ] ALLOWED_ORIGINS — production domains only, no localhost
[ ] WEB_URL — production HTTPS URL
[ ] TRUST_PROXY=1 — set if behind a reverse proxy
[ ] SENTRY_DSN — configured
[ ] METRICS_PASSWORD — changed from default

Database
[ ] Latest migrations applied: npm run migrate:status
[ ] No pending migrations
[ ] All required indexes present

Application
[ ] Docker image built from production Dockerfile (Dockerfile.prod)
[ ] Health checks passing: /health/live and /health/ready
[ ] Graceful shutdown tested: SIGTERM → clean stop within 30s
[ ] HIPAA startup warnings resolved (check logs after first start)

Monitoring
[ ] Prometheus scraper can reach /metrics
[ ] Sentry receiving test event
[ ] Grafana dashboards show data
[ ] Alert rules configured in prometheus-alerts.yml
```
