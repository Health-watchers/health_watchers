# Debugging Procedures

Structured workflows for diagnosing issues in every major subsystem. Follow the steps in order — each step either resolves the issue or narrows the scope for the next.

---

## Table of Contents

- [General First-Pass Procedure](#general-first-pass-procedure)
- [Debugging a Failing HTTP Request](#debugging-a-failing-http-request)
- [Debugging Authentication & JWT](#debugging-authentication--jwt)
- [Debugging Database Issues](#debugging-database-issues)
- [Debugging Background Jobs](#debugging-background-jobs)
- [Debugging Payment / Stellar Flows](#debugging-payment--stellar-flows)
- [Debugging WebSocket / Socket.IO](#debugging-websocket--socketio)
- [Debugging Rate Limiting](#debugging-rate-limiting)
- [Debugging Cache Behavior](#debugging-cache-behavior)
- [Debugging Email Delivery](#debugging-email-delivery)
- [Debugging HIPAA / Encryption Issues](#debugging-hipaa--encryption-issues)
- [Using the Built-in Observability Stack](#using-the-built-in-observability-stack)

---

## General First-Pass Procedure

Run these five checks before diving into any subsystem. They catch 80% of issues in under 2 minutes.

**Step 1 — Capture the `requestId`**

Every error response contains a `requestId`. Grab it:
```json
{ "error": "InternalServerError", "requestId": "a1b2c3d4-..." }
```

**Step 2 — Search the logs**

```bash
# Pino outputs structured JSON. Filter by requestId:
jq 'select(.requestId == "a1b2c3d4-...")' /var/log/api/app.log

# Or in Docker:
docker logs health-watchers-api 2>&1 | jq 'select(.requestId == "a1b2c3d4-...")'
```

**Step 3 — Check health endpoints**

```bash
curl http://localhost:4000/health/live    # Is the process alive?
curl http://localhost:4000/health/ready  # Is DB + Redis reachable?
```

**Step 4 — Check Sentry**

Go to Sentry → search for the `requestId` in the event breadcrumbs. Only 5xx errors are forwarded.

**Step 5 — Check Prometheus metrics**

```bash
curl -u "$METRICS_USERNAME:$METRICS_PASSWORD" http://localhost:4000/metrics \
  | grep -E 'http_request_duration|mongodb_connection|rate_limit'
```

---

## Debugging a Failing HTTP Request

### 1. Identify the status code

| Status | Most likely cause | Go to |
|---|---|---|
| 400 | Validation failure — check `details[]` | Step 2 |
| 401 | Token missing, expired, or revoked | [Auth debugging](#debugging-authentication--jwt) |
| 403 | Wrong role, MFA not set up, CSRF missing | [Auth debugging](#debugging-authentication--jwt) |
| 404 | Wrong path, wrong API version, record deleted | Step 3 |
| 409 | Duplicate key or duplicate resource | Check `field` in response |
| 415 | Wrong Content-Type header | Add `Content-Type: application/json` |
| 422 | Request body present but unparseable | Check JSON syntax |
| 429 | Rate limit hit | [Rate limiting debugging](#debugging-rate-limiting) |
| 500 | Unhandled exception | Step 4 |
| 503 | DB or Redis down | [Database debugging](#debugging-database-issues) |

### 2. Inspect the `details` array (400 errors)

Zod validation errors list every failing field:
```json
{
  "details": [
    { "path": "body.email", "message": "Invalid email" },
    { "path": "body.role", "message": "Invalid enum value. Expected 'DOCTOR' | 'NURSE' ..." }
  ]
}
```
Fix each field listed in `details`. Common issues: wrong enum value, missing required field, wrong date format.

### 3. Verify the route exists

```bash
# List all routes via Swagger
open http://localhost:4000/api-docs

# Or check API versions endpoint
curl http://localhost:4000/api/versions
```

Make sure you're using the correct prefix (`/api/v1` vs `/api/v2`).

### 4. Reproduce the 500 in dev mode

In development (`NODE_ENV=development`), the `stack` trace is included in the 500 response:
```json
{ "error": "InternalServerError", "stack": "Error: ...\n  at ..." }
```
Read the stack trace to identify the exact line that threw.

---

## Debugging Authentication & JWT

### Flow overview

```
POST /auth/login
  → password check
  → MFA check (if enabled)
  → return { accessToken, refreshToken }
         ↓
All protected routes: Authorization: Bearer <accessToken>
  → validateAccessTokenClaims()  (iss, aud, exp, jti, signature)
  → isDenylisted(jti)            (Redis denylist)
  → isInvalidatedForUser()       (password-change invalidation)
  → req.user = { userId, role, clinicId }
```

### Decode a token without verification

```bash
# Paste your token here — never do this with a real secret in prod
node -e "
const jwt = require('jsonwebtoken');
const token = 'YOUR_TOKEN_HERE';
console.log(JSON.stringify(jwt.decode(token), null, 2));
"
```

Check: `iss`, `aud`, `exp` (Unix timestamp), `jti` (should be a UUID).

### Check if `exp` is in the past

```bash
node -e "console.log(new Date(<exp_value> * 1000).toISOString())"
```

If it's in the past, the token is expired. Call `POST /auth/refresh`.

### Verify env vars match token claims

```bash
echo $JWT_ISSUER    # must match token's "iss"
echo $JWT_AUDIENCE  # must match token's "aud"
```

### Check the denylist (Redis)

```bash
redis-cli -u "$REDIS_URL" GET "denylist:<jti_value>"
# Returns the TTL if the token is denylisted
```

### Check per-user invalidation

```bash
redis-cli -u "$REDIS_URL" GET "user:invalidated:<userId>"
# Returns a Unix timestamp — tokens issued before this time are rejected
```

### Debug MFA issues

1. **TOTP rejected:** Check device clock sync. Try the next 30-second window.
2. **Temp token expired:** Temp tokens live 5 minutes. Restart the login flow.
3. **Backup code invalid:** Codes are single-use. Check remaining count: `GET /auth/mfa/backup-codes/count`.
4. **MFA secret encrypted:** The secret is stored AES-256 encrypted. If `FIELD_ENCRYPTION_KEY` changed without migration, decryption will fail — all MFA users must re-enroll.

---

## Debugging Database Issues

### Check connection state

```bash
# From the API
curl http://localhost:4000/health/ready
# Returns { "db": "connected" | "disconnected" | "connecting" }

# Direct MongoDB check
mongosh "$MONGO_URI" --eval "db.adminCommand({ serverStatus: 1 }).connections"
```

### Monitor connection pool

```bash
# Prometheus metric
curl -s http://localhost:4000/metrics | grep mongodb_connection_pool_size

# Or pool metrics via API (if SUPER_ADMIN auth available)
curl -H "Authorization: Bearer <token>" http://localhost:4000/api/v2/health/db-pool
```

Pool utilization thresholds:
- `≥ 80%` → warn log: `db:pool:high_utilization`
- `≥ 95%` → error log: `db:pool:critical_utilization`

### Find slow queries

Enable MongoDB profiler for queries > 100ms:
```javascript
// In mongosh
db.setProfilingLevel(1, { slowms: 100 });
db.system.profile.find().sort({ ts: -1 }).limit(10);
```

### Check missing indexes

```javascript
// Run in mongosh — find full collection scans
db.system.profile.find({ "planSummary": /COLLSCAN/ }).sort({ ts: -1 });
```

### Diagnose a specific query

```javascript
// Use explain() to see the query plan
db.patients.find({ clinicId: ObjectId("..."), isActive: true })
  .explain("executionStats");
// Look for: winningPlan.stage = "IXSCAN" (good) vs "COLLSCAN" (bad)
// Look for: totalDocsExamined vs nReturned — ratio should be close to 1:1
```

---

## Debugging Background Jobs

The app runs these cron jobs at startup (all registered in `app.ts`):

| Job | Purpose | Stop function |
|---|---|---|
| `paymentExpirationJob` | Expire unpaid intents | `stopPaymentExpirationJob` |
| `reconciliationJob` | Reconcile Stellar payments | `stopReconciliationJob` |
| `riskRecalculationJob` | Recompute patient risk scores | `stopRiskRecalculationJob` |
| `balanceMonitoringJob` | Monitor Stellar balances | `stopBalanceMonitoringJob` |
| `waitlistExpiryJob` | Expire stale waitlist entries | `stopWaitlistExpiryJob` |
| `appointmentReminderJob` | Send appointment reminders | `stopAppointmentReminderJob` |
| `claimableExpiryNotificationJob` | Notify about expiring claimable balances | `stopClaimableExpiryNotificationJob` |
| `xlmRateJob` | Update XLM exchange rates | `stopXLMRateJob` |
| `mfaGracePeriodJob` | Enforce MFA grace period expiry | `stopMfaGracePeriodJob` |
| `followUpReminderJob` | Send follow-up encounter reminders | `stopFollowUpReminderJob` |
| `retryWorker` | Retry failed webhook deliveries | `stopRetryWorker` |

### Verify a job started

```bash
grep "job" /var/log/api/app.log | grep -i "start\|error"
```

### Diagnose a job that's not running

1. Check startup logs for the job name — it should log on start.
2. Verify no startup exception prevented it from being called (look for errors before the job start lines).
3. If using BullMQ (`retryWorker`), verify Redis is available.
4. Check if the job throws silently — wrap job logic in try/catch and log errors.

### Manually trigger reconciliation (dev only)

```bash
# Import and call the job function directly in ts-node
npx ts-node -r tsconfig-paths/register -e "
const { startReconciliationJob } = require('./src/modules/payments/services/reconciliation-job');
startReconciliationJob();
"
```

---

## Debugging Payment / Stellar Flows

### Payment state machine

```
created → pending → confirmed
                 ↘ expired (via paymentExpirationJob)
                 ↘ failed
```

### Trace a payment end-to-end

```bash
# 1. Find payment record by intentId
mongosh "$MONGO_URI" --eval "
db.paymentrecords.findOne({ intentId: '<intentId>' })
"

# 2. Check the Stellar transaction directly
curl "https://horizon-testnet.stellar.org/transactions/<txHash>"

# 3. Check stellar-service logs
docker logs stellar-service 2>&1 | grep "<intentId>"

# 4. Check webhook delivery
mongosh "$MONGO_URI" --eval "
db.webhookdeliveries.find({ 'payload.intentId': '<intentId>' }).sort({ createdAt: -1 })
"
```

### Verify Stellar network config

```bash
# Confirm which network is active
echo $STELLAR_NETWORK   # should be 'testnet' or 'mainnet'
echo $MAINNET_CONFIRMED # must be 'true' for mainnet

# Testnet Horizon
curl https://horizon-testnet.stellar.org/

# Mainnet Horizon
curl https://horizon.stellar.org/
```

### Check XLM balance

```bash
curl "https://horizon-testnet.stellar.org/accounts/$STELLAR_PLATFORM_PUBLIC_KEY" \
  | jq '.balances[] | select(.asset_type == "native")'
```

### Debug a failed refund

1. Check `dispute.refundIntentId` — if set, refund was already issued (idempotency).
2. Verify original payment exists in `paymentrecords` by `intentId`.
3. Check that the payment date is within 30 days (`REFUND_WINDOW_DAYS`).
4. Verify `destinationPublicKey` is a valid Stellar address (56-character G... string).
5. Check Stellar service logs for `issueRefund` errors.

---

## Debugging WebSocket / Socket.IO

### Check Socket.IO is initialized

```bash
grep "Socket.IO" /var/log/api/app.log
# Should see: "Socket.IO service initialized" and "Socket.IO initialised"
```

### Test a connection from the browser console

```javascript
// In browser DevTools
const socket = io('http://localhost:4000', {
  auth: { token: 'Bearer <accessToken>' }
});
socket.on('connect', () => console.log('connected:', socket.id));
socket.on('connect_error', (err) => console.error('error:', err.message));
```

### Check CORS for Socket.IO

Socket.IO uses `WEB_URL` for its CORS origin check. Verify:
```bash
echo $WEB_URL  # must match the frontend origin exactly (no trailing slash)
```

### Multi-pod Socket.IO issues

If events are missed in a multi-pod deployment, clients and emitters are on different pods. Fix: configure Socket.IO with a Redis adapter. Check if `REDIS_URL` is set.

---

## Debugging Rate Limiting

### Identify which limiter fired

The response body contains the limiter name in the message:
```json
{ "error": "TooManyRequests", "message": "Too many login attempts. Try again in 15 minutes." }
```

Check the `Retry-After` header for how long to wait.

### Check current rate-limit state (Redis)

```bash
# Rate-limit keys are stored as: rl:<limiter>:<key>
redis-cli -u "$REDIS_URL" KEYS "rl:auth:*"
redis-cli -u "$REDIS_URL" GET "rl:auth:<ip_address>"
```

### Reset a rate-limit counter (dev/ops)

```bash
# Find the key pattern and delete it
redis-cli -u "$REDIS_URL" DEL "rl:auth:192.168.1.1"
```

### Verify Redis is being used

Check startup logs:
```
[rate-limit] Redis store configured
```
If you see `[rate-limit] REDIS_URL not configured. Using in-memory store.` then rate limits are per-pod only.

---

## Debugging Cache Behavior

### Check what's in the cache

```bash
# Via API endpoint (requires SUPER_ADMIN auth)
curl -H "Authorization: Bearer <token>" \
  http://localhost:4000/api/v2/cache/debug

# Via Redis directly
redis-cli -u "$REDIS_URL" KEYS "patients:list:*"
redis-cli -u "$REDIS_URL" TTL "patients:list:<clinicId>:page=1:limit=20"
```

### Force cache invalidation

```bash
# Via API
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"key": "patients:list:<clinicId>:page=1:limit=20"}' \
  http://localhost:4000/api/v2/cache/invalidate

# Via Redis (nuclear option — flushes all cached keys)
redis-cli -u "$REDIS_URL" FLUSHDB  # WARNING: also clears rate-limit state
```

### Check cache warmup

```bash
grep "cache" /var/log/api/app.log | grep -i "warmup\|warm\|cold"
```

---

## Debugging Email Delivery

### Test SMTP connectivity

```bash
# Telnet test
telnet $SMTP_HOST $SMTP_PORT

# Node.js test (run in ts-node)
const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
t.verify().then(console.log).catch(console.error);
```

### Check email logs

```bash
grep "email\|nodemailer\|smtp" /var/log/api/app.log -i
```

### Debug password reset flow

1. `POST /auth/forgot-password` — always returns 200 (prevents email enumeration).
2. Check DB: `db.users.findOne({ email: '...' }, { resetPasswordTokenHash: 1, resetPasswordExpiresAt: 1 })` — if `resetPasswordTokenHash` is set, the token was generated.
3. Check SMTP logs for delivery.
4. Token expires in 1 hour — check `resetPasswordExpiresAt`.

---

## Debugging HIPAA / Encryption Issues

### Verify encryption key is active

```bash
# At startup, the API logs key status:
grep "HIPAA" /var/log/api/app.log | head -20
# Should show: ✅ set for FIELD_ENCRYPTION_KEY, AUDIT_ENCRYPTION_KEY, BACKUP_ENCRYPTION_KEY
```

### Diagnose decryption failure

If encrypted fields return garbage or errors:
1. Verify `FIELD_ENCRYPTION_KEY` is the same key used when data was encrypted.
2. Check `FIELD_ENCRYPTION_KEY_VERSION` — during key rotation, old records use the old key version.
3. Run the key-rotation script: `apps/api/scripts/rotate-encryption-key.ts`.

### Audit log verification

```bash
# Check audit log entries for a user
mongosh "$MONGO_URI" --eval "
db.auditlogs.find({ userId: '<userId>' }).sort({ createdAt: -1 }).limit(20)
"

# Check for a specific action
mongosh "$MONGO_URI" --eval "
db.auditlogs.find({ action: 'LOGIN_FAILED', createdAt: { \$gt: new Date(Date.now() - 3600000) } })
"
```

---

## Using the Built-in Observability Stack

### Prometheus metrics endpoint

```bash
curl -u "$METRICS_USERNAME:$METRICS_PASSWORD" http://localhost:4000/metrics
```

Key metrics to check:

| Metric | What it tells you |
|---|---|
| `http_request_duration_seconds` | Request latency p50/p95/p99 by route |
| `http_requests_total` | Request count and status codes |
| `mongodb_connection_pool_size` | Active DB connections |
| `mongodb_pool_wait_queue_size` | Queued requests waiting for a connection |
| `rate_limit_hits_total` | Rate limit triggers by limiter and method |

### OpenTelemetry traces

If `OTEL_EXPORTER_OTLP_ENDPOINT` is set, traces are exported to your collector (Jaeger, Honeycomb, Datadog, etc.). Search by `requestId` or `traceId`.

In development (no endpoint set), traces are logged to stdout.

### Sentry error tracking

1. Open Sentry → your project.
2. Search by `requestId` in event search.
3. Check the breadcrumbs trail for the sequence of events leading to the error.
4. Check the "Tags" — `userId`, `clinicId`, `path` are tagged on all events.

### Log level adjustment

Change log verbosity without restart via the config endpoint (SUPER_ADMIN only):
```bash
curl -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"level": "debug"}' \
  http://localhost:4000/api/v2/admin/log-level
```

Or restart with: `LOG_LEVEL=debug npm run dev`

---

## Quick Reference: Log Event Patterns

| Log event | What it means |
|---|---|
| `db:connected` | MongoDB connected successfully |
| `db:disconnected` | MongoDB connection dropped |
| `db:pool:high_utilization` | Pool > 80% used — watch for exhaustion |
| `db:pool:critical_utilization` | Pool > 95% used — imminent exhaustion |
| `db:pool:wait_queue` | Requests queued waiting for a connection |
| `[rate-limit] limit exceeded` | Rate limit fired — IP and limiter name in metadata |
| `[migration-manager] Initialized` | Migration manager ready |
| `[cache] startup warmup failed` | Non-fatal — cache starts cold |
| `Socket.IO service initialized` | Socket.IO ready |
