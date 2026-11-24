# Common Errors — 50+ Issues with Solutions

All errors are indexed by their short code (ERR-NNN) for fast lookup. Each entry includes the symptom, root cause, and an actionable fix.

---

## Startup & Configuration Errors

### ERR-001 — Environment validation failed at startup

**Symptom:**
```
❌ Environment validation failed:
+---------------------------+--------------------------------------------------+
| Variable                  | Issue                                            |
+---------------------------+--------------------------------------------------+
| JWT_ACCESS_TOKEN_SECRET   | JWT_ACCESS_TOKEN_SECRET must be at least 32 chars|
+---------------------------+--------------------------------------------------+
Process exited with code 1
```

**Cause:** One or more required environment variables are missing or invalid. The Zod schema in `config/env.ts` fails on startup.

**Fix:**
1. Copy `.env.example` to `.env`: `cp .env.example .env`
2. Fill in every variable flagged in the error table.
3. For JWT secrets, generate a strong value: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. Re-start the server.

---

### ERR-002 — `FIELD_ENCRYPTION_KEY` missing in production (hard exit)

**Symptom:**
```
🚨 HIPAA VIOLATION: FIELD_ENCRYPTION_KEY is not set in production.
PHI will be stored in plaintext. Set a 64-char hex AES-256 key immediately.
Process exited with code 1
```

**Cause:** `NODE_ENV=production` and `FIELD_ENCRYPTION_KEY` is not set. The server intentionally refuses to start to prevent unencrypted PHI.

**Fix:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy the 64-char output → set as FIELD_ENCRYPTION_KEY
```
Store it in your secret manager (AWS Secrets Manager, Vault, etc.), not in `.env` files committed to git.

---

### ERR-003 — `REDIS_URL` not set in production

**Symptom:**
```
⚠️ WARNING: REDIS_URL is not set in production. Rate limiting will be in-memory
and NOT shared across instances.
```

**Cause:** Multi-replica deployment without Redis means each pod has its own rate-limit counter, allowing distributed brute-force attacks.

**Fix:**
1. Provision a Redis instance (Redis Cloud, ElastiCache, Upstash, etc.).
2. Set `REDIS_URL=redis://<host>:6379` (use `rediss://` for TLS).
3. Confirm connectivity: `redis-cli -u "$REDIS_URL" PING`

---

### ERR-004 — `MONGO_URI` is not set

**Symptom:**
```
❌ Environment validation failed:
| MONGO_URI | Missing required env var: MONGO_URI |
```

**Cause:** `MONGO_URI` is required and was not provided.

**Fix:** Set `MONGO_URI=mongodb://localhost:27017/health_watchers` (dev) or your Atlas connection string (prod). Verify with: `mongosh "$MONGO_URI" --eval "db.adminCommand({ping:1})"`

---

### ERR-005 — Port already in use

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::4000
```

**Cause:** Another process is bound to the same port.

**Fix:**
```bash
# Find the process
netstat -ano | findstr :4000   # Windows
lsof -i :4000                  # Mac/Linux

# Kill it or change API_PORT in .env
```

---

### ERR-006 — `JWT_TEMP_TOKEN_SECRET` not validated (known issue)

**Symptom:** MFA challenge accepts any token; `verifyTempToken` does not reject forged tokens.

**Cause:** `JWT_TEMP_TOKEN_SECRET` is read from `process.env` in `token.service.ts` but is **not declared in the Zod schema**. If it's unset, `jsonwebtoken` signs with an empty key and accepts anything.

**Fix:** Ensure `JWT_TEMP_TOKEN_SECRET` is set in every environment. Tracked bug — add to `env.ts` Zod schema:
```typescript
JWT_TEMP_TOKEN_SECRET: z.string().min(32, '...'),
```

---

## Authentication Errors

### ERR-007 — `401` on every authenticated request

**Symptom:** All requests return `{"error":"Unauthorized","code":"INVALID_TOKEN"}` immediately after login.

**Cause (most common):** Access token is being sent incorrectly.

**Fix:** Verify the `Authorization` header format:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
- No quotes around the token.
- Single space between `Bearer` and the token.
- No trailing newline.

---

### ERR-008 — `Token has expired` on fresh login

**Symptom:** Access token rejected as expired even though it was just issued.

**Cause:** Server and client clocks are out of sync by more than the token's 15-minute window.

**Fix:**
1. Sync the server clock: `ntpdate -u pool.ntp.org` (Linux) or enable Windows Time Service.
2. If running in Docker: `docker run --rm busybox date` — Docker inherits host time. Restart Docker if drifted.
3. Access tokens expire in 15 minutes by default; ensure the client is calling `/auth/refresh` before expiry.

---

### ERR-009 — `Token has been revoked`

**Symptom:** Valid-looking token rejected with `{"error":"Unauthorized","code":"INVALID_TOKEN","message":"Token has been revoked"}`.

**Cause:** The token's `jti` is on the denylist. This happens after: explicit logout, password change, or admin revocation.

**Fix:** Discard the old token and authenticate again. Do not retry with the same token.

---

### ERR-010 — `Token reuse detected — all sessions revoked`

**Symptom:** Refresh token rejected with token reuse error. All other sessions for the user also stop working.

**Cause:** A refresh token was used a second time (replay attack protection). Could be legitimate double-submission from a client bug, or actual token theft.

**Fix:**
1. Check client code — ensure the refresh call is not firing twice simultaneously (guard with a semaphore/mutex).
2. Log in again to obtain a fresh token family.
3. If this happens repeatedly, investigate for token theft.

---

### ERR-011 — Account locked (HTTP 423)

**Symptom:**
```json
{ "error": "AccountLocked", "retryAfter": 900 }
```

**Cause:** 5 consecutive failed login attempts or 5 failed MFA attempts. Account is locked for 15 minutes.

**Fix:**
- Wait `retryAfter` seconds, then retry.
- SUPER_ADMIN can unlock immediately: `POST /api/v1/auth/unlock` with `{ "email": "..." }`
- Check the user's email for a lockout notification.

---

### ERR-012 — MFA `InvalidCode` on correct TOTP

**Symptom:** TOTP code from authenticator app is rejected even though it looks correct.

**Cause (most common):** Clock drift on the device running the authenticator app. TOTP codes are time-based (30-second window).

**Fix:**
1. Sync the authenticator device's clock (automatic time sync in iOS/Android settings).
2. Try the next code (30 seconds later).
3. If the issue persists, disable and re-enroll MFA: `DELETE /auth/mfa/disable` then `POST /auth/mfa/setup`.

---

### ERR-013 — `requiresMfaSetup: true` returned on login

**Symptom:** Login returns HTTP 403 with `error: "MfaRequired"` and `requiresMfaSetup: true`.

**Cause:** The user's role (DOCTOR, NURSE, CLINIC_ADMIN, SUPER_ADMIN) requires MFA. The 7-day grace period has expired.

**Fix:**
1. Use the `tempToken` from the response to complete MFA setup.
2. `POST /auth/mfa/setup` with the temp token to get a QR code.
3. Scan with an authenticator app and verify with `POST /auth/mfa/verify`.

---

### ERR-014 — `warning: "mfa_required"` in login response

**Symptom:** Login succeeds but the response contains `warning: "mfa_required"` and `mfaGracePeriodEndsAt`.

**Cause:** The user's role requires MFA but the grace period has not yet expired. Login is allowed but MFA must be set up before the deadline.

**Fix:** Set up MFA before `mfaGracePeriodEndsAt`. Use `POST /auth/mfa/setup`.

---

### ERR-015 — `MISSING_ISSUER` / `INVALID_ISSUER` token error

**Symptom:** Token rejected with `MISSING_ISSUER` or `INVALID_ISSUER`.

**Cause:** `JWT_ISSUER` env var on the server differs from what was used to sign the token, or the token was generated externally without the correct `iss` claim.

**Fix:** Ensure `JWT_ISSUER` is consistent across all environments. Default: `health-watchers-api`. Never change this in production without invalidating all existing tokens.

---

### ERR-016 — Password reset token `Invalid or expired`

**Symptom:** `POST /auth/reset-password` returns `{"error":"BadRequest","message":"Invalid or expired reset token"}`.

**Cause:** Reset tokens expire after **1 hour**. The token may also be invalid if the URL was double-encoded.

**Fix:**
1. Request a new reset link: `POST /auth/forgot-password`.
2. Use the link within 1 hour.
3. Check that the `token` query parameter is URL-decoded before sending.

---

### ERR-017 — Email verification link says `Invalid or expired`

**Symptom:** Clicking the verification email link returns a 400 error.

**Cause:** The verification token is single-use and expires when used. It can also be invalidated if the user re-registers.

**Fix:** If still unverified, contact a SUPER_ADMIN to manually set `emailVerified: true` in the database or trigger a new verification email.

---

### ERR-018 — `CORS: origin not allowed` on API calls

**Symptom:** Browser console shows a CORS error before any request body is processed.

**Cause:** The frontend origin is not in the `ALLOWED_ORIGINS` environment variable.

**Fix:**
```bash
# Add your frontend URL (no trailing slash)
ALLOWED_ORIGINS=https://app.yourdomain.com,https://staging.yourdomain.com
```
Restart the API after changing. CORS is applied at the Express middleware level on startup.

---

## Database Errors

### ERR-019 — MongoDB connection failed (ECONNREFUSED)

**Symptom:**
```
MongoDB connection failed, retrying… (attempt 1)
MongoDB connection failed after max retries
Process exited with code 1
```

**Cause:** MongoDB is not reachable at the `MONGO_URI` host:port.

**Fix:**
1. Verify MongoDB is running: `mongosh "$MONGO_URI" --eval "db.adminCommand({ping:1})"`
2. Check Docker Compose: `docker-compose ps` — is the `mongo` service running?
3. Check firewall rules / security groups.
4. If using Atlas, verify IP allowlist includes your server's IP.

---

### ERR-020 — MongoDB duplicate key error (HTTP 409)

**Symptom:**
```json
{"error":"Conflict","code":"CONFLICT","message":"A record with this email (\"user@example.com\") already exists."}
```

**Cause:** A unique index constraint was violated.

**Fix:** Use a unique value for the indexed field. The `field` property in the response identifies which field is duplicated.

---

### ERR-021 — Invalid ObjectId (HTTP 400)

**Symptom:**
```json
{"error":"BadRequest","message":"\"id\" is not a valid ID. IDs must be 24-character hexadecimal strings."}
```

**Cause:** A route parameter like `:id` or `:clinicId` contains a non-ObjectId string.

**Fix:** MongoDB ObjectIds are 24 hex characters. Do not use slugs or other formats. Example valid ID: `507f1f77bcf86cd799439011`.

---

### ERR-022 — Connection pool exhausted

**Symptom:** Requests time out with `MongoServerError: connection pool timeout` or `waitQueueTimeoutMS expired`.

**Cause:** All connections in the pool are busy; new requests sit in the wait queue until `waitQueueTimeoutMS` (default 5 s) expires.

**Fix:**
1. Increase pool size: `MONGODB_POOL_SIZE=20` (check DB server capacity first).
2. Find slow queries using `GET /metrics` → look at `mongodb_connection_pool_size`.
3. Add missing indexes (see [database-troubleshooting.md](./database-troubleshooting.md)).
4. Check for unclosed cursors or missing `await` in async handlers.

---

### ERR-023 — Mongoose `CastError` on query

**Symptom:** `"id" is not a valid ID` even though the ID looks correct.

**Cause:** Mongoose can't cast the string to `ObjectId`. Often caused by an extra space or line break.

**Fix:** Trim the ID before use: `id.trim()`. Validate with `mongoose.Types.ObjectId.isValid(id)`.

---

### ERR-024 — `MongooseError.ValidationError` (HTTP 400)

**Symptom:**
```json
{"error":"ValidationError","details":[{"path":"email","message":"Path `email` is required."}]}
```

**Cause:** A required field on a Mongoose schema is missing before a `.save()` or `.create()` call.

**Fix:** Ensure all required model fields are provided. Check the relevant Mongoose model's schema definition.

---

## Request / Response Errors

### ERR-025 — HTTP 415 Unsupported Media Type

**Symptom:**
```json
{"error":"UnsupportedMediaType","message":"Content-Type must be application/json"}
```

**Cause:** A POST/PUT/PATCH request was sent without `Content-Type: application/json`.

**Fix:** Add the header to every mutating request:
```
Content-Type: application/json
```
Exception: CSV import (`/patients/import`) and patient photo upload routes accept `multipart/form-data`.

---

### ERR-026 — HTTP 404 Route not found

**Symptom:**
```json
{"success": false, "message": "Route not found"}
```

**Cause:** The path does not match any registered route.

**Fix:**
1. Verify the API version prefix: `/api/v1/...` or `/api/v2/...`.
2. Check the HTTP method (GET vs POST, etc.).
3. View all routes at `GET /api-docs` (Swagger UI).
4. Check for trailing slashes — the router is strict.

---

### ERR-027 — Request body too large (HTTP 413)

**Symptom:** `PayloadTooLargeError: request entity too large`

**Cause:** Request body exceeds `MAX_REQUEST_BODY_SIZE` (default `10kb`). AI endpoints use `AI_REQUEST_BODY_SIZE` (default `500kb`).

**Fix:**
- For regular endpoints: paginate or compress the payload.
- For AI endpoints: ensure the body is within the `AI_REQUEST_BODY_SIZE` limit.
- Raise the limit only as a last resort: `MAX_REQUEST_BODY_SIZE=50kb`.

---

### ERR-028 — MongoDB injection attempt blocked

**Symptom:** Query operators like `$where`, `$gt` in request body are silently replaced with `_` in query results.

**Cause:** `express-mongo-sanitize` replaces characters like `$` and `.` in request body to prevent NoSQL injection. This is expected security behavior.

**Fix:** Do not use MongoDB operator keys in request bodies. These are stripped server-side.

---

## Rate Limiting Errors

### ERR-029 — Too Many Requests (HTTP 429)

**Symptom:**
```json
{"error":"TooManyRequests","message":"Too many login attempts. Try again in 15 minutes."}
```
Response includes `Retry-After` and `RateLimit-Remaining: 0` headers.

**Cause:** Rate limit exceeded. Each limiter has different thresholds (see [error-codes.md](./error-codes.md#http-429--too-many-requests)).

**Fix:**
1. Wait for the `Retry-After` duration (in seconds).
2. In development, disable rate limiting by ensuring `NODE_ENV=test` or by using a whitelist.
3. If a legitimate batch process is hitting limits, use the per-user limiters (`bulkExportLimiter`, `reportGenerationLimiter`).
4. In production with multiple pods but no Redis, every pod has its own counter — set `REDIS_URL` to share state.

---

### ERR-030 — Rate limit not working across multiple pods

**Symptom:** Rate limit is hit on one pod but not enforced on others.

**Cause:** `REDIS_URL` is not set; each pod uses an in-memory rate-limit store.

**Fix:** Set `REDIS_URL` in production. The rate-limit middleware falls back to in-memory with a warning log when Redis is unavailable.

---

## Payment Errors (Stellar)

### ERR-031 — Payment not confirmed after submission

**Symptom:** Payment record has status `pending` and never transitions to `confirmed`.

**Cause:** Stellar transaction not finalized on the network, or the webhook from `stellar-service` was not received.

**Fix:**
1. Check `stellar-service` logs for transaction submission errors.
2. Verify `STELLAR_SERVICE_URL` is reachable from the API.
3. Check Stellar Horizon directly: `https://horizon-testnet.stellar.org/transactions/<txHash>`.
4. Confirm `STELLAR_NETWORK` matches the network your Horizon URL points to.

---

### ERR-032 — Refund window expired (HTTP 400)

**Symptom:**
```json
{"error":"Refund window expired. Refunds must be issued within 30 days of original payment."}
```

**Cause:** The original payment is older than 30 days.

**Fix:** Refunds outside the window require manual processing via SUPER_ADMIN and direct Stellar transaction. Document the exception in the audit log.

---

### ERR-033 — Dispute already exists (HTTP 409)

**Symptom:**
```json
{"error":"Dispute already exists for this payment"}
```

**Cause:** Only one dispute is allowed per payment intent.

**Fix:** Retrieve the existing dispute: `GET /api/v1/payments/disputes?clinicId=...` and work with it. If the original dispute was incorrectly closed, a SUPER_ADMIN can modify it directly.

---

### ERR-034 — `Refund amount must be between 0 and <X>`

**Symptom:** Refund request returns a 400 with the amount constraint message.

**Cause:** The requested refund amount is zero, negative, or exceeds the original payment amount.

**Fix:** Verify the original payment amount with `GET /api/v1/payments/:intentId`. Refunds must be positive and ≤ the original amount.

---

### ERR-035 — Review period still active (HTTP 425)

**Symptom:**
```json
{"error":"Review period is still active. Dispute cannot be resolved until <date>."}
```

**Cause:** Evidence was submitted and the 7-day review period has not elapsed.

**Fix:** Wait until `reviewDeadline`. SUPER_ADMIN can override this restriction.

---

## WebSocket / Socket.IO Errors

### ERR-036 — Socket.IO connection refused

**Symptom:** Frontend Socket.IO client receives `ERR_CONNECTION_REFUSED` or `xhr poll error`.

**Cause:** `WEB_URL` in the API's environment doesn't include the frontend origin.

**Fix:** Add the frontend URL to `WEB_URL`: `WEB_URL=https://app.yourdomain.com`. This controls the Socket.IO CORS allowlist. For multiple origins, `ALLOWED_ORIGINS` is also checked.

---

### ERR-037 — Socket.IO events not received in real time

**Symptom:** Events fire on the server but the client doesn't receive them.

**Cause:** In a multi-pod deployment without sticky sessions, a client may be connected to a different pod than the one emitting the event.

**Fix:** Configure a Redis adapter for Socket.IO so events are broadcast across pods. Set `REDIS_URL` and configure `socket.io-redis` adapter.

---

## File Storage Errors

### ERR-038 — File upload fails (S3)

**Symptom:** Patient photo or document upload returns 500 with `NoSuchBucket` or `AccessDenied`.

**Cause:** `S3_BUCKET` doesn't exist, or `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` lack the required permissions.

**Fix:**
1. Verify bucket exists and is in `S3_REGION`.
2. IAM policy must include `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on the bucket ARN.
3. Check `STORAGE_DRIVER=s3` is set (default is `local`).

---

### ERR-039 — File upload fails (local storage)

**Symptom:** Upload returns 500 with `ENOENT: no such file or directory`.

**Cause:** `LOCAL_UPLOAD_DIR` does not exist.

**Fix:** Create the directory: `mkdir -p ./uploads`. Ensure the API process has write permission.

---

## Email / SMTP Errors

### ERR-040 — Password reset email not received

**Symptom:** `POST /auth/forgot-password` returns 200 but no email arrives.

**Cause:** SMTP is not configured, or the email is in spam.

**Fix:**
1. Check SMTP config: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
2. Test connectivity: `telnet $SMTP_HOST $SMTP_PORT`.
3. Check spam folder.
4. Check API logs for `nodemailer` errors.
5. If using SendGrid: set `EMAIL_PROVIDER=sendgrid` and `SENDGRID_API_KEY`.

---

### ERR-041 — `HIPAA WARNING: SMTP_HOST is not set in production`

**Symptom:** Warning logged at startup; breach notification emails won't send.

**Cause:** HIPAA § 164.410 requires automated breach notifications. SMTP is not configured.

**Fix:** Configure SMTP or SendGrid before going live. See ERR-040.

---

## AI / Gemini Errors

### ERR-042 — AI endpoint returns 500

**Symptom:** `POST /api/v2/ai/...` returns 500 with a Gemini-related error.

**Cause:** `GEMINI_API_KEY` is missing, expired, or the API quota is exhausted.

**Fix:**
1. Verify `GEMINI_API_KEY` is set and valid.
2. Check Google AI Studio for quota usage.
3. The AI rate limiter caps at 20 req/min per clinic. Check `RateLimit-Remaining`.

---

### ERR-043 — AI request body too large

**Symptom:** AI endpoint returns 413.

**Cause:** AI requests use a separate body size limit (`AI_REQUEST_BODY_SIZE`, default `500kb`). The submitted clinical text exceeds this.

**Fix:** Truncate the input or increase `AI_REQUEST_BODY_SIZE` (e.g., `1mb`).

---

## CSRF Errors

### ERR-044 — `403 Forbidden` on state-changing requests from frontend

**Symptom:** Mutations (POST/PUT/PATCH/DELETE) fail with a CSRF-related 403 even with a valid JWT.

**Cause:** The CSRF middleware (`csrf.middleware.ts`) requires a valid `X-CSRF-Token` header on state-changing requests.

**Fix:**
1. Fetch the CSRF token from the cookie set by the API on first request.
2. Include it in every mutation: `X-CSRF-Token: <token>`.
3. The header is listed in `allowedHeaders` in the CORS config.

---

## Observability Errors

### ERR-045 — Sentry not capturing errors

**Symptom:** Errors occur in production but nothing appears in Sentry.

**Cause:** `SENTRY_DSN` is not set or is invalid.

**Fix:**
1. Set `SENTRY_DSN` to your project's ingest URL.
2. Verify Sentry is initialized — `instrument.ts` must be imported before any other module in `app.ts`.
3. Note: 4xx errors are intentionally not sent to Sentry (only 5xx unhandled exceptions are).

---

### ERR-046 — `/metrics` endpoint returns 401 or 403

**Symptom:** Prometheus scraper cannot access `GET /metrics`.

**Cause:** The endpoint is protected by either HTTP Basic Auth or an IP allowlist.

**Fix:**
- **Basic Auth:** Set `METRICS_USERNAME` and `METRICS_PASSWORD` in the scraper config.
- **IP allowlist:** Add the scraper's IP to `METRICS_ALLOWED_IPS` (comma-separated).
- In development, leave both unset to allow open access.

---

## Backup & Recovery Errors

### ERR-047 — Backup job fails with `EACCES`

**Symptom:** Backup service reports permission denied when writing to `BACKUP_BUCKET`.

**Cause:** AWS credentials lack `s3:PutObject` on the backup bucket.

**Fix:** Attach an IAM policy granting `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::${BACKUP_BUCKET}/*`.

---

### ERR-048 — Backup decryption fails after key rotation

**Symptom:** Attempting to restore a backup fails with a decryption error.

**Cause:** `BACKUP_ENCRYPTION_KEY` was rotated, but old backup archives were encrypted with the previous key.

**Fix:** Retain the old key until all backups encrypted with it have expired per `BACKUP_RETENTION_DAYS`. Store old key versions in your secret manager under a versioned name (e.g., `BACKUP_ENCRYPTION_KEY_V1`).

---

## Webhook Errors

### ERR-049 — Insurance webhook rejected (401)

**Symptom:** Inbound insurance reimbursement webhooks return 401.

**Cause:** `INSURANCE_WEBHOOK_SECRET` is missing or does not match the secret configured at the insurance provider.

**Fix:** Ensure `INSURANCE_WEBHOOK_SECRET` matches the HMAC secret registered with the insurance partner. Rotate both ends simultaneously.

---

### ERR-050 — Webhook retry worker not processing

**Symptom:** Failed webhook deliveries are not being retried.

**Cause:** `startRetryWorker()` job did not start, or the worker crashed silently.

**Fix:**
1. Check startup logs for `[retry-worker]` messages.
2. Verify Redis is available — BullMQ queues require Redis.
3. Check `GET /api/v2/webhooks/retry-queue/stats` for queue health.

---

## Stellar / Payment Infrastructure Errors

### ERR-051 — `STELLAR_DRY_RUN=true` in production

**Symptom:** Payments are accepted but no actual transactions appear on the Stellar network.

**Cause:** Dry-run mode is enabled; transactions are simulated.

**Fix:** Set `STELLAR_DRY_RUN=false` in production. Confirm with `GET /api/v2/payments/network-status`.

---

### ERR-052 — `MAINNET_CONFIRMED` not set with `STELLAR_NETWORK=mainnet`

**Symptom:** Stellar service exits with code 1 at startup.

**Cause:** Safety gate prevents accidental mainnet usage. Must explicitly confirm.

**Fix:** Set `MAINNET_CONFIRMED=true` **only** when you have confirmed all Stellar config is production-ready. This enables real XLM transactions.

---

### ERR-053 — XLM transaction amount exceeds limit

**Symptom:** Payment rejected with an amount limit error.

**Cause:** `STELLAR_MAX_TRANSACTION_XLM` (default 1000 XLM) caps single transaction size.

**Fix:** For large payments, increase the limit: `STELLAR_MAX_TRANSACTION_XLM=5000`. Document the change in your security policy.

---

## Cache Errors

### ERR-054 — Stale data returned after update

**Symptom:** After updating a patient record, the old data is returned.

**Cause:** The response cache (`cache.middleware.ts`) has not invalidated the cached entry.

**Fix:**
1. Check `GET /api/v2/cache/debug` for cache key state.
2. Manually bust the key: `POST /api/v2/cache/invalidate` with the resource key.
3. Cache TTLs are typically 60 seconds. If staleness is a problem, reduce the TTL for affected routes.

---

### ERR-055 — Cache warmup failed at startup

**Symptom:** Log entry: `[cache] startup warmup failed` or `[cache] failed to register patient-list warmup entries`.

**Cause:** DB query during warmup failed (e.g., no active clinics, or DB not yet fully ready).

**Fix:** This is non-fatal — the server continues without warm cache. The first request will populate the cache. Investigate if the underlying DB query is failing for other reasons.

---

## Migration Errors

### ERR-056 — Migration stuck in `pending` state

**Symptom:** `npm run migrate:status` shows a migration as pending forever.

**Cause:** A previous migration run may have crashed mid-way, leaving the `changelog` collection in an inconsistent state.

**Fix:** See [migration-troubleshooting.md §Stuck Migrations](./migration-troubleshooting.md#stuck-migrations).

---

### ERR-057 — Index creation fails during migration

**Symptom:** Migration exits with `MongoServerError: Index already exists with a different name`.

**Cause:** The same index definition exists under a different name from a prior migration run.

**Fix:** Drop the conflicting index first: `db.collection.dropIndex("<old_name>")`, then re-run the migration.

---

## Miscellaneous

### ERR-058 — `Cannot find module` at runtime

**Symptom:**
```
Error: Cannot find module '@health-watchers/config'
```

**Cause:** Workspace package not built or not linked.

**Fix:**
```bash
# From monorepo root
npm install
npm run build --workspaces --if-present
```

---

### ERR-059 — TypeScript path aliases not resolved

**Symptom:**
```
Cannot find module '@api/middlewares/auth.middleware'
```

**Cause:** `tsconfig-paths` is not loaded, or the `paths` config in `tsconfig.json` is not aligned with the runtime registration.

**Fix:** Start dev server with: `ts-node-dev --respawn -r tsconfig-paths/register src/app.ts`. Ensure `tsconfig-paths` is in `devDependencies`.

---

### ERR-060 — Graceful shutdown not completing

**Symptom:** Container/pod takes longer than expected to stop; `SIGTERM` is ignored.

**Cause:** Active jobs or open connections are preventing the shutdown hooks from completing.

**Fix:**
1. Check `registerGracefulShutdown` in `utils/graceful-shutdown.ts`.
2. All background jobs are stopped in order: `stopPaymentExpirationJob`, `stopReconciliationJob`, etc.
3. If a job hangs, it will be force-killed after the timeout. Check job logs for the hanging task.
4. Increase the Kubernetes/Docker `terminationGracePeriodSeconds` if jobs need more time.
