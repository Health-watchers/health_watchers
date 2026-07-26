#!/usr/bin/env bash
set -e
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "Security: JWT temp token reuses access token secret in token.service.ts" \
  --label "security,bug,high-priority" \
  --body "## Description

In \`apps/api/src/modules/auth/token.service.ts\`, the \`signTempToken\` function (line ~55) signs the temporary MFA challenge token using \`config.jwt.accessTokenSecret\` — the same secret used for full access tokens:

\`\`\`ts
export function signTempToken(userId: string): string {
  return jwt.sign({ userId }, config.jwt.accessTokenSecret, {
    expiresIn: TEMP_TOKEN_EXPIRY,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}
\`\`\`

Similarly, \`verifyTempToken\` also uses \`config.jwt.accessTokenSecret\`. This means a temp token (issued before MFA is completed) could theoretically be accepted by \`verifyAccessToken\` if the payload shape happens to match, or vice versa. In a HIPAA-compliant system, tokens with different trust levels must use distinct secrets so that a pre-MFA token cannot be confused with a fully-authenticated access token.

**Why it matters in production:** If an attacker intercepts a temp token (e.g., via a log leak or network sniff), they could attempt to use it as an access token. The shared secret removes one layer of defense-in-depth.

## Tasks

- [ ] Add a dedicated \`JWT_TEMP_TOKEN_SECRET\` environment variable to \`.env.example\` and \`apps/api/src/config/env.ts\`
- [ ] Update \`packages/config/index.ts\` to expose \`jwt.tempTokenSecret\`
- [ ] Refactor \`signTempToken\` and \`verifyTempToken\` in \`token.service.ts\` to use the new secret
- [ ] Add a Zod validation rule in \`env.ts\` requiring \`JWT_TEMP_TOKEN_SECRET\` to be at least 32 characters
- [ ] Update \`apps/api/src/modules/auth/token.service.test.ts\` to cover the separation
- [ ] Update Kubernetes secrets manifest \`k8s/secrets.yaml\` and Helm \`templates/secret.yaml\` to include the new secret
- [ ] Document the change in \`SECURITY.md\`

## Acceptance Criteria

- \`signTempToken\` uses \`config.jwt.tempTokenSecret\`, not \`config.jwt.accessTokenSecret\`
- \`verifyTempToken\` uses \`config.jwt.tempTokenSecret\`
- A temp token cannot be verified by \`verifyAccessToken\` (unit test asserts this)
- CI passes with the new env var set in the test matrix
- \`.env.example\` documents \`JWT_TEMP_TOKEN_SECRET\`"

gh issue create --repo "$REPO" \
  --title "Security: Webhook delivery does not validate URL scheme — SSRF risk in webhook.service.ts" \
  --label "security,bug,high-priority" \
  --body "## Description

In \`apps/api/src/modules/webhooks/webhook.service.ts\`, the \`deliverWebhook\` function accepts any URL string and immediately calls \`axios.post(url, ...)\` without validating the scheme or host:

\`\`\`ts
await axios.post(url, payload, { headers: { ... }, timeout: 10000 });
\`\`\`

An authenticated CLINIC_ADMIN could register a webhook pointing to \`http://169.254.169.254/latest/meta-data/\` (AWS metadata endpoint) or internal services like \`http://localhost:27017\`, enabling Server-Side Request Forgery (SSRF). In a HIPAA environment running on cloud infrastructure, this could expose instance credentials or internal service data.

**Why it matters in production:** SSRF is listed in the OWASP Top 10. Cloud-hosted instances are particularly vulnerable because the metadata endpoint can return IAM credentials.

## Tasks

- [ ] Create a URL allowlist/denylist validator in \`apps/api/src/utils/url-validator.ts\`
- [ ] Block private IP ranges (RFC 1918: 10.x, 172.16-31.x, 192.168.x), loopback (127.x), link-local (169.254.x), and IPv6 equivalents
- [ ] Enforce \`https://\` scheme only for webhook URLs (configurable via env for dev)
- [ ] Apply the validator in \`webhooks.controller.ts\` at webhook creation/update time (Zod refinement)
- [ ] Apply the validator again inside \`deliverWebhook\` as a defense-in-depth check
- [ ] Add unit tests covering blocked and allowed URLs
- [ ] Update Swagger docs for the webhook endpoint to document the URL constraints

## Acceptance Criteria

- Registering a webhook with \`http://169.254.169.254/...\` returns HTTP 400
- Registering a webhook with \`http://localhost:...\` returns HTTP 400
- Registering a webhook with \`http://\` (non-HTTPS) returns HTTP 400 in production mode
- Valid \`https://\` external URLs are accepted
- Existing webhook tests still pass"

gh issue create --repo "$REPO" \
  --title "Security: MONGO_URI logged in plaintext at startup in apps/api/src/config/env.ts" \
  --label "security,bug,high-priority" \
  --body "## Description

In \`apps/api/src/config/env.ts\` (lines ~60-65), the validated config is printed to stdout at startup:

\`\`\`ts
console.log('✅ Config validated:');
console.log(\`   MONGO_URI:       \${env.MONGO_URI}\`);
\`\`\`

If \`MONGO_URI\` contains credentials (e.g., \`mongodb://admin:password@host:27017/db\`), those credentials appear in plaintext in application logs. In production environments where logs are shipped to centralized logging systems (Datadog, CloudWatch, ELK), this constitutes a credential leak and a HIPAA audit finding.

**Why it matters in production:** Log aggregation systems are often accessible to a broader set of engineers than the secrets manager. Credentials in logs violate the principle of least privilege and HIPAA's technical safeguard requirements.

## Tasks

- [ ] Replace the raw \`MONGO_URI\` log with a redacted version that masks credentials: e.g., \`mongodb://***@host:27017/db\`
- [ ] Create a \`redactConnectionString(uri: string): string\` utility in \`apps/api/src/utils/redact.ts\`
- [ ] Apply the same redaction to any other connection strings logged at startup (Redis, etc.)
- [ ] Add a unit test for \`redactConnectionString\` covering URIs with and without credentials
- [ ] Audit all \`console.log\` and \`logger.info\` calls in \`config/\` directory for other secret leaks
- [ ] Add a pre-commit hook check or ESLint rule to flag \`console.log\` of env vars

## Acceptance Criteria

- Application startup logs do not contain raw database passwords
- \`redactConnectionString('mongodb://user:pass@host/db')\` returns \`'mongodb://***@host/db'\`
- Unit test for the utility passes
- CI lint check catches future violations"

gh issue create --repo "$REPO" \
  --title "Bug: Patient PHI fields encrypted on save but not re-encrypted on findOneAndUpdate — data integrity gap in patient.model.ts" \
  --label "bug,security,data-integrity" \
  --body "## Description

In \`apps/api/src/modules/patients/models/patient.model.ts\`, PHI fields (\`contactNumber\`, \`address\`, \`dateOfBirth\`) are encrypted in the \`pre('save')\` hook and decrypted in \`post('find')\`, \`post('findOne')\`, and \`post('findOneAndUpdate')\` hooks. However, there is **no \`pre('findOneAndUpdate')\` hook** to encrypt the incoming update payload before it is written to MongoDB.

This means that when \`PatientModel.findOneAndUpdate({ ... }, { \$set: { contactNumber: '555-1234' } })\` is called anywhere in \`patients.controller.ts\`, the raw plaintext value is stored in the database, bypassing the encryption layer entirely.

**Why it matters in production:** Unencrypted PHI in MongoDB violates HIPAA's encryption-at-rest requirement and the project's own security design. A database dump or unauthorized MongoDB access would expose patient contact details in plaintext.

## Tasks

- [ ] Add a \`pre('findOneAndUpdate')\` hook in \`patient.model.ts\` that encrypts PHI fields in \`this.getUpdate()\`
- [ ] Handle both \`\$set\` and top-level field updates in the hook
- [ ] Add a \`pre('updateMany')\` hook for bulk update scenarios
- [ ] Write integration tests that call \`findOneAndUpdate\` with PHI fields and assert the stored value is encrypted
- [ ] Audit \`patients.controller.ts\` for all \`findOneAndUpdate\` / \`updateOne\` calls to confirm they go through the model
- [ ] Add a migration script to re-encrypt any existing plaintext PHI fields

## Acceptance Criteria

- After calling \`PatientModel.findOneAndUpdate\` with a new \`contactNumber\`, the raw MongoDB document contains an encrypted value (not plaintext)
- The \`post('findOneAndUpdate')\` hook still decrypts the returned document correctly
- Existing patient tests pass
- A new test specifically covers the update encryption path"

gh issue create --repo "$REPO" \
  --title "Performance: Missing compound index on encounters collection causes full collection scans" \
  --label "performance,database,enhancement" \
  --body "## Description

In \`apps/api/src/modules/encounters/encounter.model.ts\`, the \`EncounterModel\` schema defines individual indexes on \`patientId\`, \`clinicId\`, and \`status\`, but there is no compound index covering the most common query pattern used in \`encounters.controller.ts\`:

\`\`\`ts
// From encounters.controller.ts — the aggregation pipeline always filters by clinicId first
{ clinicId: req.user!.clinicId, patientId: ..., status: ..., createdAt: ... }
\`\`\`

Without a compound index like \`{ clinicId: 1, status: 1, createdAt: -1 }\`, MongoDB performs a collection scan or uses a suboptimal single-field index when filtering encounters for a clinic by status and sorting by date. As encounter volume grows (thousands per clinic), this causes significant query latency.

**Why it matters in production:** The encounters list endpoint is called on every page load of the encounters dashboard. Slow queries directly impact clinician workflow and can cause request timeouts under load.

## Tasks

- [ ] Add compound index \`{ clinicId: 1, status: 1, createdAt: -1 }\` to \`encounter.model.ts\`
- [ ] Add compound index \`{ clinicId: 1, patientId: 1, createdAt: -1 }\` for patient-scoped encounter queries
- [ ] Add compound index \`{ clinicId: 1, attendingDoctorId: 1, createdAt: -1 }\` for doctor-scoped queries
- [ ] Create a migration file \`apps/api/src/migrations/YYYYMMDD_encounter_compound_indexes.ts\` using migrate-mongo
- [ ] Run \`EXPLAIN\` on the encounters aggregation pipeline and document the improvement
- [ ] Add index hints in the aggregation pipeline where appropriate
- [ ] Update \`apps/api/src/modules/encounters/encounters.controller.ts\` to use \`.lean()\` on read queries

## Acceptance Criteria

- MongoDB \`EXPLAIN\` output shows \`IXSCAN\` (not \`COLLSCAN\`) for the primary encounters list query
- Query time for a clinic with 10,000 encounters is under 50ms (measured in a load test)
- Migration runs successfully via \`npm run migrate:up --workspace=api\`
- Existing encounter tests pass"

gh issue create --repo "$REPO" \
  --title "Bug: Socket.IO CORS origin hardcoded to WEB_URL env var — falls back to localhost in production" \
  --label "bug,security" \
  --body "## Description

In \`apps/api/src/realtime/socket.ts\`, the Socket.IO server is initialized with:

\`\`\`ts
cors: {
  origin: process.env.WEB_URL || 'http://localhost:3000',
  credentials: true,
}
\`\`\`

The \`WEB_URL\` environment variable is not defined in \`apps/api/src/config/env.ts\` (the Zod schema), so it is not validated at startup. If \`WEB_URL\` is accidentally omitted from the production environment, Socket.IO will accept connections from \`http://localhost:3000\`, which in a production context means it accepts connections from any origin that claims to be localhost — effectively disabling CORS protection for WebSocket connections.

**Why it matters in production:** Real-time events include payment confirmations, patient risk alerts, and lab result notifications. An open CORS policy on Socket.IO could allow malicious websites to subscribe to these events.

## Tasks

- [ ] Add \`WEB_URL\` to the Zod schema in \`apps/api/src/config/env.ts\` as a required string in production
- [ ] Update \`packages/config/index.ts\` to expose \`webUrl\`
- [ ] Replace the \`process.env.WEB_URL\` reference in \`socket.ts\` with \`config.webUrl\`
- [ ] Support comma-separated multiple origins (same pattern as \`ALLOWED_ORIGINS\` in \`app.ts\`)
- [ ] Add a unit test for the Socket.IO auth middleware
- [ ] Update \`.env.example\` to document \`WEB_URL\`
- [ ] Update Helm \`configmap.yaml\` and \`k8s/configmap.yaml\` to include \`WEB_URL\`

## Acceptance Criteria

- Missing \`WEB_URL\` in production causes startup to fail with a clear error message
- Socket.IO only accepts connections from the configured origin(s)
- Existing Socket.IO functionality (clinic rooms, user rooms) works correctly
- Unit test for the auth middleware passes"

gh issue create --repo "$REPO" \
  --title "Testing: No integration tests for patient PHI encryption/decryption lifecycle" \
  --label "testing,security,enhancement" \
  --body "## Description

The \`apps/api/src/modules/patients/models/patient.model.ts\` implements field-level encryption for PHI fields (\`contactNumber\`, \`address\`, \`dateOfBirth\`) using \`pre('save')\` and \`post('find*')\` hooks. However, the existing test files (\`patients.test.ts\`, \`patients.controller.test.ts\`, \`allergy.test.ts\`) do not include any tests that verify:

1. PHI fields are stored encrypted in MongoDB (not plaintext)
2. PHI fields are correctly decrypted when retrieved via \`find\`, \`findOne\`, and \`findOneAndUpdate\`
3. The encryption is consistent (same input → same encrypted output with the same key)
4. Decryption fails gracefully if the encryption key changes

Without these tests, a refactor of the encryption logic could silently break PHI protection without CI catching it.

## Tasks

- [ ] Create \`apps/api/src/modules/patients/phi-encryption.test.ts\`
- [ ] Test that \`PatientModel.create()\` stores \`contactNumber\` as an encrypted string (not the raw value)
- [ ] Test that \`PatientModel.findOne()\` returns the decrypted \`contactNumber\`
- [ ] Test that \`PatientModel.findOneAndUpdate()\` with a new \`contactNumber\` stores it encrypted
- [ ] Test that \`PatientModel.find()\` decrypts all documents in the result array
- [ ] Test graceful handling when \`ENCRYPTION_KEY\` is missing or invalid
- [ ] Add the test file to the Jest coverage report
- [ ] Ensure tests use an in-memory MongoDB (mongodb-memory-server) for isolation

## Acceptance Criteria

- All new PHI encryption tests pass in CI
- Code coverage for \`patient.model.ts\` reaches at least 80%
- Tests run in under 10 seconds using mongodb-memory-server
- No real MongoDB connection is required for the tests"

gh issue create --repo "$REPO" \
  --title "Enhancement: Standardize API pagination — missing cursor-based pagination for large datasets" \
  --label "enhancement,api,performance" \
  --body "## Description

The current pagination implementation in \`apps/api/src/utils/paginate.ts\` uses offset-based pagination (\`skip\`/\`limit\`). This is used across patients, encounters, payments, and other endpoints. Offset-based pagination has a well-known performance problem: \`skip(N)\` in MongoDB requires scanning and discarding N documents, making deep pages (e.g., page 500 of 10,000 records) extremely slow.

Additionally, the \`parsePagination\` utility caps \`limit\` at 100 but does not enforce a minimum, and the \`meta\` response shape is inconsistent across endpoints (some return \`{ total, page, limit }\`, others return \`{ total, page, limit, totalPages }\`).

**Why it matters in production:** Clinics with large patient populations (10,000+ patients) will experience degraded performance on later pages. Inconsistent pagination metadata makes frontend development error-prone.

## Tasks

- [ ] Add cursor-based pagination support to \`paginate.ts\` using \`_id\` as the cursor
- [ ] Standardize the pagination response envelope: \`{ data, meta: { total, page, limit, totalPages, hasNextPage, nextCursor } }\`
- [ ] Update all controllers (patients, encounters, payments, audit-logs, lab-results) to use the standardized envelope
- [ ] Add a \`parseCursorPagination\` utility function
- [ ] Update Swagger/OpenAPI docs to reflect the new response shape
- [ ] Add unit tests for both offset and cursor pagination utilities
- [ ] Update the frontend \`apps/web\` API client to handle the new envelope

## Acceptance Criteria

- All paginated endpoints return the standardized \`meta\` object
- Cursor-based pagination is available as an opt-in via \`?cursor=\` query param
- \`GET /api/v1/patients?page=1&limit=20\` returns \`meta.hasNextPage\` and \`meta.totalPages\`
- Performance test shows cursor pagination is O(1) regardless of page depth
- Swagger docs are updated"

gh issue create --repo "$REPO" \
  --title "Security: Rate limiter uses in-memory store in multi-instance deployments — limits not shared across pods" \
  --label "security,infrastructure,bug" \
  --body "## Description

In \`apps/api/src/middlewares/rate-limit.middleware.ts\`, the rate limiters fall back to an in-memory store when \`REDIS_URL\` is not set:

\`\`\`ts
async function buildStore() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return undefined; // in-memory fallback
  ...
}
\`\`\`

In the Kubernetes deployment (\`k8s/api/deployment.yaml\`), the API runs with multiple replicas. With in-memory rate limiting, each pod maintains its own counter. An attacker can bypass the auth rate limit (10 req/15min) by distributing requests across pods — effectively multiplying the limit by the number of replicas.

**Why it matters in production:** The auth rate limiter is the primary brute-force protection for the login endpoint. Bypassing it enables credential stuffing attacks against patient and clinician accounts.

## Tasks

- [ ] Make \`REDIS_URL\` required (not optional) when \`NODE_ENV=production\` in \`env.ts\`
- [ ] Add a startup warning (not just a silent fallback) when Redis is unavailable in production
- [ ] Install \`rate-limit-redis\` and \`redis\` as proper dependencies (not optional peers) in \`apps/api/package.json\`
- [ ] Add a health check for Redis connectivity in \`apps/api/src/modules/health/health.controller.ts\`
- [ ] Update \`k8s/api/deployment.yaml\` to include \`REDIS_URL\` from the ConfigMap
- [ ] Update Helm \`values.yaml\` to configure Redis URL
- [ ] Add integration test that verifies rate limiting works across simulated concurrent requests

## Acceptance Criteria

- In production mode, missing \`REDIS_URL\` logs a warning and the rate limiter uses Redis
- The auth limiter correctly blocks the 11th request within 15 minutes across all instances
- Health endpoint reports Redis status
- CI test verifies rate limit behavior"

gh issue create --repo "$REPO" \
  --title "Bug: Webhook delivery retry loop is synchronous — blocks the event loop for up to 36 seconds" \
  --label "bug,performance,reliability" \
  --body "## Description

In \`apps/api/src/modules/webhooks/webhook.service.ts\`, the \`deliverWebhook\` function implements retry logic with synchronous \`await\` inside a for loop:

\`\`\`ts
const backoffMs = [1000, 5000, 30000]; // 1s, 5s, 30s
for (let attempt = 0; attempt < maxAttempts; attempt++) {
  try {
    await axios.post(url, payload, { timeout: 10000 });
    ...
  } catch (error) {
    // implicit: next iteration waits backoffMs[attempt] ms
  }
}
\`\`\`

There is no \`await sleep(backoffMs[attempt])\` between retries, so retries happen immediately without the intended backoff delay. More critically, the entire retry loop (up to 3 attempts × 10s timeout = 30s) runs synchronously within the request handler, blocking the response and consuming a Node.js worker for the full duration.

**Why it matters in production:** Webhook delivery is triggered during payment confirmation and encounter creation. A slow or unresponsive webhook endpoint will cause the entire API request to hang for up to 30 seconds, degrading the user experience for all concurrent users.

## Tasks

- [ ] Move webhook delivery to a background job (use \`setImmediate\` or a proper queue like Bull/BullMQ)
- [ ] Implement the backoff delay: add \`await new Promise(r => setTimeout(r, backoffMs[attempt]))\` between retries
- [ ] Return immediately from the API handler after enqueuing the webhook delivery
- [ ] Add a \`WebhookDeliveryQueue\` using Bull or a simple in-process queue
- [ ] Add a \`GET /api/v1/webhooks/:id/deliveries\` endpoint to check delivery status
- [ ] Write tests for the retry logic including backoff timing
- [ ] Update Swagger docs

## Acceptance Criteria

- Webhook delivery does not block the API response
- Retries respect the backoff delays (1s, 5s, 30s)
- Failed deliveries are recorded in \`WebhookDeliveryModel\` with correct status
- API response time for endpoints that trigger webhooks is not affected by webhook latency"

echo "Issues 1-10 created successfully"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add request ID propagation from API to stellar-service for distributed tracing" \
  --label "enhancement,observability,infrastructure" \
  --body "## Description

The API generates a \`x-request-id\` header via \`pinoHttp\` in \`apps/api/src/app.ts\` and exposes it via the \`traceIdHeader\` middleware. However, when the API calls the stellar-service via \`StellarClient\` in \`apps/api/src/modules/payments/services/stellar-client.ts\`, the request ID is not forwarded in the outgoing HTTP headers.

This means that when a payment fails and you need to correlate API logs with stellar-service logs, there is no shared identifier to link the two log streams. In a production incident, this makes root cause analysis significantly harder.

**Why it matters in production:** Payment failures are high-severity incidents. Without correlated request IDs, debugging a failed Stellar transaction requires manually correlating timestamps across two separate log streams.

## Tasks

- [ ] Add an \`x-request-id\` header to all outgoing axios requests in \`stellar-client.ts\`
- [ ] Thread the request ID through from the Express \`req\` object to the \`StellarClient\` methods
- [ ] Update \`StellarClient\` constructor or methods to accept an optional \`requestId\` parameter
- [ ] Update \`apps/api/src/modules/payments/payments.controller.ts\` to pass \`req.requestId\` to stellar client calls
- [ ] Ensure the stellar-service logs the incoming \`x-request-id\` header in \`apps/stellar-service/src/index.ts\`
- [ ] Add OpenTelemetry trace context propagation (W3C TraceContext headers) as a follow-up
- [ ] Update the \`apps/api/src/tracing.ts\` to configure context propagation

## Acceptance Criteria

- All stellar-service HTTP calls include \`x-request-id\` matching the originating API request
- Stellar-service logs include the request ID in structured log output
- A failed payment can be traced from API log to stellar-service log using a single request ID
- Existing payment tests pass"

gh issue create --repo "$REPO" \
  --title "Bug: AI drug interaction check parses raw LLM text — JSON parse failure throws unhandled error" \
  --label "bug,reliability,ai" \
  --body "## Description

In \`apps/api/src/modules/ai/ai.service.ts\`, the \`checkDrugInteractions\` function calls Gemini and attempts to parse the response as JSON:

\`\`\`ts
const text = result.response.text().trim();
try {
  return JSON.parse(text) as DrugInteractionResult;
} catch {
  throw new Error(\`Failed to parse drug interaction response: \${text}\`);
}
\`\`\`

The Gemini model is instructed to return JSON only, but LLMs are non-deterministic. If the model returns markdown-wrapped JSON (\`\`\`json {...}\`\`\`), extra explanation text, or a partial response due to token limits, the \`JSON.parse\` will throw. This error propagates to the route handler and returns a 500 to the client with the raw LLM output in the error message — potentially leaking clinical context.

**Why it matters in production:** Drug interaction checks are safety-critical. A parse failure that returns 500 instead of a safe fallback could cause a clinician to proceed without interaction information. Leaking LLM output in error messages may also expose patient data.

## Tasks

- [ ] Add a JSON extraction helper that strips markdown code fences before parsing
- [ ] Implement a retry with a stricter prompt if the first parse fails
- [ ] Return a safe fallback \`DrugInteractionResult\` with \`severity: 'none'\` and a disclaimer if all retries fail
- [ ] Never include raw LLM output in error responses sent to the client
- [ ] Add unit tests for the JSON extraction helper with various malformed inputs
- [ ] Add integration tests for the drug interaction endpoint with a mocked Gemini client
- [ ] Log the raw LLM output at \`debug\` level (not in the error response) for debugging

## Acceptance Criteria

- Malformed LLM JSON responses do not cause 500 errors
- The endpoint returns a safe fallback result when parsing fails
- Raw LLM output is never included in HTTP error responses
- Unit tests cover markdown-wrapped JSON, extra text, and empty responses
- Existing AI tests pass"

gh issue create --repo "$REPO" \
  --title "Enhancement: Implement HIPAA-compliant audit log retention policy and automated archival" \
  --label "enhancement,compliance,hipaa" \
  --body "## Description

The \`AuditLogModel\` in \`apps/api/src/modules/audit/audit.model.ts\` stores audit logs indefinitely in MongoDB with no TTL index or archival strategy. HIPAA requires audit logs to be retained for a minimum of 6 years. However, storing 6 years of high-volume audit logs in the primary MongoDB instance will cause the \`audit_logs\` collection to grow unboundedly, degrading query performance and increasing storage costs.

The current indexes (\`timestamp: -1\`, \`userId: 1, timestamp: -1\`, etc.) will become increasingly slow as the collection grows to millions of documents.

**Why it matters in production:** Without a retention policy, the audit_logs collection will consume unbounded storage. Without archival, HIPAA compliance cannot be demonstrated for the full 6-year retention period.

## Tasks

- [ ] Create a \`GET /api/v1/audit/export\` endpoint that exports audit logs to S3/GCS for archival
- [ ] Add a scheduled job (\`apps/api/src/modules/audit/audit-archival-job.ts\`) that archives logs older than 90 days to cold storage
- [ ] Add a TTL index on \`timestamp\` for logs older than 6 years (2190 days) as a safety net
- [ ] Add a \`GET /api/v1/audit/stats\` endpoint showing collection size and oldest/newest log timestamps
- [ ] Document the retention policy in \`SECURITY.md\`
- [ ] Add a Prometheus metric for audit log collection size
- [ ] Write tests for the archival job

## Acceptance Criteria

- Audit logs older than 6 years are automatically deleted (TTL index)
- Logs between 90 days and 6 years are archived to cold storage
- The archival job runs on a configurable schedule (default: daily)
- \`GET /api/v1/audit/stats\` returns collection size metrics
- HIPAA 6-year retention is documented and demonstrable"

gh issue create --repo "$REPO" \
  --title "Bug: Next.js middleware.ts references undefined PUBLIC_PATHS and isStaffPublic variables" \
  --label "bug,frontend" \
  --body "## Description

In \`apps/web/src/middleware.ts\`, the middleware function references two undefined variables:

\`\`\`ts
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(\`\${path}/\`));
}
// ...
const isPublic = isStaffPublic(pathname);  // isStaffPublic is not defined
\`\`\`

\`PUBLIC_PATHS\` is never declared in this file (the file defines \`STAFF_PUBLIC\` and \`PORTAL_PUBLIC\` separately), and \`isStaffPublic\` is never defined as a function. This would cause a \`ReferenceError\` at runtime for any non-portal route, effectively breaking authentication protection for all staff routes.

**Why it matters in production:** If the middleware throws a ReferenceError, Next.js may either crash the middleware or fall through to the route handler without authentication, exposing protected routes to unauthenticated users.

## Tasks

- [ ] Define \`PUBLIC_PATHS\` as the union of \`STAFF_PUBLIC\` and \`PORTAL_PUBLIC\`, or rename consistently
- [ ] Define \`isStaffPublic\` as a function using \`STAFF_PUBLIC\` array
- [ ] Define \`LOGIN_PATH\` constant (also referenced but not defined in the file)
- [ ] Add TypeScript strict mode checks to catch undefined variable references
- [ ] Write unit tests for the middleware using Next.js middleware test utilities
- [ ] Add E2E test that verifies unauthenticated access to \`/patients\` redirects to \`/login\`

## Acceptance Criteria

- No \`ReferenceError\` is thrown when the middleware processes any route
- Unauthenticated requests to \`/patients\`, \`/encounters\`, \`/payments\` redirect to \`/login\`
- Authenticated requests to \`/login\` redirect to \`/\`
- TypeScript compilation succeeds with no errors
- E2E auth tests pass"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add database connection pool monitoring and alerting" \
  --label "enhancement,observability,reliability" \
  --body "## Description

In \`apps/api/src/app.ts\`, the MongoDB connection pool size is tracked every 15 seconds:

\`\`\`ts
setInterval(() => {
  const poolSize = mongoose.connection.pool?.totalConnectionCount ?? 0;
  mongodbConnectionPoolSize.set(poolSize);
}, 15_000);
\`\`\`

However, there is no alerting when the pool is exhausted or approaching its limit. The default MongoDB driver pool size is 5 connections. Under load, if all 5 connections are in use, new requests will queue and eventually time out, causing cascading failures.

Additionally, the \`monitoring/alerts.yml\` Prometheus alerting rules do not include any MongoDB-specific alerts.

**Why it matters in production:** Connection pool exhaustion is a common cause of production outages in Node.js/MongoDB applications. Without alerting, the team will only discover the issue after users report errors.

## Tasks

- [ ] Add Prometheus metrics for pool wait queue length and connection acquisition time
- [ ] Add a \`MONGODB_POOL_SIZE\` environment variable to configure the pool size (default: 10 for production)
- [ ] Add Prometheus alert rules in \`monitoring/alerts.yml\` for pool utilization > 80%
- [ ] Add a Grafana dashboard panel for MongoDB connection pool metrics
- [ ] Configure the Mongoose connection with explicit \`maxPoolSize\` and \`serverSelectionTimeoutMS\`
- [ ] Add a health check endpoint that reports pool utilization
- [ ] Write a load test that verifies the API handles pool exhaustion gracefully

## Acceptance Criteria

- Prometheus exposes \`mongodb_connection_pool_size\`, \`mongodb_pool_wait_queue_size\` metrics
- Alert fires when pool utilization exceeds 80% for more than 2 minutes
- Grafana dashboard shows pool metrics
- API returns 503 (not 500) when the connection pool is exhausted
- Health endpoint reports pool status"

gh issue create --repo "$REPO" \
  --title "Security: Stellar private key stored in MongoDB without additional encryption layer" \
  --label "security,blockchain,high-priority" \
  --body "## Description

In \`apps/api/src/modules/clinics/clinic-keypair.model.ts\`, the clinic's Stellar private key (secret key) is stored in MongoDB. While the \`encrypt\` utility from \`@api/lib/encrypt\` is used in the patient model, it is not clear from the keypair model whether the secret key field uses the same encryption. The \`keypair.service.ts\` handles key generation and storage.

Stellar secret keys (starting with 'S') provide full control over a clinic's Stellar account and all its funds. If the MongoDB database is compromised, unencrypted secret keys would allow an attacker to drain all clinic Stellar accounts.

**Why it matters in production:** A single database breach could result in theft of all clinic funds held in Stellar accounts. This is a catastrophic financial and reputational risk.

## Tasks

- [ ] Audit \`clinic-keypair.model.ts\` and \`keypair.service.ts\` to confirm the secret key encryption status
- [ ] If not encrypted: add field-level encryption using \`@api/lib/encrypt\` for the secret key field
- [ ] Add a \`pre('save')\` hook to encrypt the secret key before storage
- [ ] Add \`post('findOne')\` and \`post('find')\` hooks to decrypt on retrieval
- [ ] Consider using AWS KMS or HashiCorp Vault for key encryption key (KEK) management
- [ ] Add a unit test that verifies the stored secret key is not the raw Stellar secret
- [ ] Document the key management approach in \`SECURITY.md\`
- [ ] Add a Prometheus alert for failed key decryption attempts

## Acceptance Criteria

- Stellar secret keys are stored encrypted in MongoDB
- Raw Stellar secret keys (starting with 'S') never appear in MongoDB documents
- Key encryption uses a separate KEK (not the same key as PHI encryption)
- Unit test verifies encryption at rest
- \`SECURITY.md\` documents the key management approach"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add OpenAPI/Swagger documentation for all payment endpoints" \
  --label "documentation,api,enhancement" \
  --body "## Description

The \`apps/api/src/modules/payments/payments.controller.ts\` file contains 30+ endpoints (payment intents, confirmations, balance, fee estimates, paths, orderbook, claimable balances, disputes, refunds, etc.) but has minimal or no JSDoc/Swagger annotations. The \`setupSwagger\` function in \`apps/api/src/docs/swagger.ts\` generates OpenAPI docs from JSDoc comments, but payment endpoints are largely undocumented.

This makes it difficult for frontend developers to understand the payment API contract, especially for complex flows like path payments, claimable balances, and fee-bump transactions.

**Why it matters in production:** Undocumented APIs lead to integration errors, incorrect assumptions about request/response shapes, and slower frontend development. For a payment system, incorrect API usage can result in failed transactions.

## Tasks

- [ ] Add \`@swagger\` JSDoc annotations to all payment endpoints in \`payments.controller.ts\`
- [ ] Document request body schemas using Zod-to-OpenAPI or manual schema definitions
- [ ] Document all response shapes including error responses (400, 402, 404, 502)
- [ ] Add examples for payment intent creation, confirmation, and path payment flows
- [ ] Document the Stellar-specific fields (memo, asset codes, claimable balance IDs)
- [ ] Add authentication requirements (\`bearerAuth\`) to all endpoints
- [ ] Generate and commit the \`openapi.json\` file to \`apps/api/docs/\`
- [ ] Add a CI step that validates the OpenAPI spec

## Acceptance Criteria

- All payment endpoints appear in the Swagger UI at \`/api/docs\`
- Each endpoint has a description, request schema, and response schemas
- Error responses are documented with example payloads
- The OpenAPI spec validates without errors
- Frontend developers can use the spec to generate a typed API client"

gh issue create --repo "$REPO" \
  --title "Enhancement: Implement patient data export in FHIR R4 format for interoperability" \
  --label "enhancement,compliance,interoperability" \
  --body "## Description

The \`apps/api/src/modules/export/export.service.ts\` currently exports patient data in CSV and PDF formats. However, HIPAA and modern healthcare interoperability standards (21st Century Cures Act) require support for FHIR (Fast Healthcare Interoperability Resources) R4 format for patient data portability.

The existing export service has the data access layer in place but lacks FHIR resource mapping. Adding FHIR R4 export would enable integration with EHR systems, patient portals, and health information exchanges.

**Why it matters in production:** Healthcare providers increasingly require FHIR-compliant data exchange. Without FHIR support, Health Watchers cannot integrate with major EHR systems or comply with information blocking rules.

## Tasks

- [ ] Create \`apps/api/src/modules/export/fhir-mapper.ts\` with Patient, Encounter, Observation, and MedicationRequest resource mappers
- [ ] Map \`PatientModel\` fields to FHIR R4 \`Patient\` resource
- [ ] Map \`EncounterModel\` fields to FHIR R4 \`Encounter\` and \`Condition\` resources
- [ ] Map vital signs to FHIR R4 \`Observation\` resources
- [ ] Map prescriptions to FHIR R4 \`MedicationRequest\` resources
- [ ] Add \`GET /api/v1/patients/:id/fhir\` endpoint returning a FHIR Bundle
- [ ] Add FHIR format option to the existing export endpoint
- [ ] Write unit tests for each FHIR mapper
- [ ] Validate output against the FHIR R4 specification

## Acceptance Criteria

- \`GET /api/v1/patients/:id/fhir\` returns a valid FHIR R4 Bundle
- The Bundle includes Patient, Encounter, Observation, and MedicationRequest resources
- FHIR validation passes using the official FHIR validator
- PHI is included only for authorized users (DOCTOR, CLINIC_ADMIN, SUPER_ADMIN)
- Unit tests cover all resource mappers"

gh issue create --repo "$REPO" \
  --title "Bug: CI workflow has duplicate 'run' keys in test job — second run command silently overrides first" \
  --label "bug,ci-cd,infrastructure" \
  --body "## Description

In \`.github/workflows/ci.yml\`, the \`test\` job's \`Generate coverage report\` step has two \`run\` keys:

\`\`\`yaml
- name: Generate coverage report
  run: npm run test:coverage || echo \"Coverage script not configured\"
  run: npm run test:coverage --workspace=apps/api || echo \"Coverage script not found, skipping\"
\`\`\`

In YAML, duplicate keys at the same level result in the last value winning. This means the first \`run\` command (\`npm run test:coverage\`) is silently ignored, and only the workspace-scoped command runs. Similarly, the \`Run unit tests\` step has a \`run\` key followed by another \`run\` key for \`Run database migrations\`.

**Why it matters in production:** Silent YAML key overrides mean the CI pipeline is not running the intended commands. Coverage reports may be incomplete, and migration steps may be skipped, leading to false confidence in CI results.

## Tasks

- [ ] Fix the duplicate \`run\` keys in the \`test\` job by merging into a single \`run\` block or splitting into separate steps
- [ ] Fix the duplicate \`run\` keys in the \`Run unit tests\` / \`Run database migrations\` steps
- [ ] Add a YAML linting step to CI using \`yamllint\` or \`actionlint\`
- [ ] Validate the entire \`ci.yml\` with \`actionlint\` locally
- [ ] Add \`actionlint\` to the pre-commit hooks in \`.husky/\`
- [ ] Review all other workflow files (\`release.yml\`, \`backup.yml\`, \`changeset-check.yml\`) for similar issues

## Acceptance Criteria

- No duplicate YAML keys exist in any workflow file
- \`actionlint\` passes on all workflow files
- Coverage reports are generated correctly in CI
- Database migrations run before tests in CI
- Pre-commit hook catches future YAML issues"

echo "Issues 11-20 created successfully"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Redis-backed session invalidation for logout and password change" \
  --label "security,enhancement,authentication" \
  --body "## Description

The current JWT implementation in \`apps/api/src/modules/auth/token.service.ts\` uses stateless access tokens with a 15-minute expiry. When a user logs out or changes their password, the access token remains valid until it expires. The refresh token is invalidated via the \`RefreshTokenModel\` in MongoDB, but the access token cannot be revoked.

In a HIPAA environment, when a clinician's account is compromised or they are terminated, their access token should be immediately invalidated — not just after 15 minutes.

**Why it matters in production:** A terminated employee or compromised account can continue accessing patient data for up to 15 minutes after their account is deactivated. This violates HIPAA's access control requirements.

## Tasks

- [ ] Create a Redis-backed token denylist in \`apps/api/src/services/token-denylist.service.ts\`
- [ ] Add the access token JTI to the denylist on logout with TTL matching the token expiry
- [ ] Add the access token JTI to the denylist on password change
- [ ] Update \`verifyAccessToken\` in \`token.service.ts\` to check the denylist
- [ ] Add JTI (\`jti\`) claim to access tokens (currently only refresh tokens have JTI)
- [ ] Add a \`POST /api/v1/auth/logout-all\` endpoint that invalidates all sessions for a user
- [ ] Write tests for the denylist service
- [ ] Update \`SECURITY.md\` to document the token invalidation strategy

## Acceptance Criteria

- After logout, the access token is rejected by \`verifyAccessToken\`
- After password change, all existing access tokens are rejected
- Token denylist entries expire automatically (Redis TTL)
- \`POST /api/v1/auth/logout-all\` invalidates all active sessions
- Tests verify token rejection after logout"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add structured error codes to all API responses for better client error handling" \
  --label "enhancement,api,developer-experience" \
  --body "## Description

The API returns error responses with inconsistent structures. Some endpoints return \`{ error: 'NotFound', message: '...' }\`, others return \`{ success: false, message: '...' }\`, and the global error handler in \`apps/api/src/middlewares/error.middleware.ts\` returns \`{ error: 'InternalServerError', message: '...' }\`. There is no machine-readable error code system that clients can use to handle specific error conditions programmatically.

For example, the frontend cannot distinguish between \"patient not found\" and \"encounter not found\" without parsing the message string, which is fragile.

**Why it matters in production:** Inconsistent error responses make frontend error handling brittle. Clients resort to string matching on error messages, which breaks when messages change.

## Tasks

- [ ] Define a comprehensive error code enum in \`packages/types/src/index.ts\` (e.g., \`PATIENT_NOT_FOUND\`, \`ENCOUNTER_NOT_FOUND\`, \`PAYMENT_FAILED\`, etc.)
- [ ] Update the error handler in \`error.middleware.ts\` to include a \`code\` field in all error responses
- [ ] Create a custom \`AppError\` class with \`statusCode\`, \`code\`, and \`message\` fields
- [ ] Update all controllers to throw \`AppError\` instead of inline \`res.status(404).json(...)\`
- [ ] Update the frontend API client in \`apps/web/src/lib/\` to handle typed error codes
- [ ] Document all error codes in the OpenAPI spec
- [ ] Write tests for each error code

## Acceptance Criteria

- All error responses include a \`code\` field with a machine-readable string
- The \`AppError\` class is used consistently across all controllers
- Frontend can switch on \`error.code\` without parsing \`error.message\`
- Error codes are documented in the OpenAPI spec
- Existing tests are updated to assert on \`code\` field"

gh issue create --repo "$REPO" \
  --title "Performance: ICD-10 search endpoint lacks text index — performs regex scan on 70,000+ codes" \
  --label "performance,database,enhancement" \
  --body "## Description

In \`apps/api/src/modules/icd10/icd10.controller.ts\`, the ICD-10 search endpoint queries the \`icd10\` collection using a regex filter on the \`description\` field. The ICD-10 dataset contains approximately 70,000+ codes. A regex scan on 70,000 documents without a text index is extremely slow (100-500ms per query).

The \`icd10.model.ts\` defines the schema but does not include a MongoDB text index on the \`description\` field.

**Why it matters in production:** The ICD-10 search is used in real-time as clinicians type diagnosis codes during encounter creation. A 300ms+ response time creates a noticeable lag in the autocomplete UI, degrading the clinical workflow.

## Tasks

- [ ] Add a MongoDB text index on \`{ description: 'text', code: 'text' }\` in \`icd10.model.ts\`
- [ ] Update the search query to use \`\$text: { \$search: query }\` instead of regex
- [ ] Add a migration file \`YYYYMMDD_icd10_text_index.ts\` to create the index on existing data
- [ ] Add Redis caching for frequent ICD-10 searches (TTL: 1 hour) using \`cache.service.ts\`
- [ ] Add a \`limit\` parameter to the search endpoint (default: 20, max: 50)
- [ ] Write a performance test comparing regex vs text index query times
- [ ] Update the frontend autocomplete to debounce requests (300ms)

## Acceptance Criteria

- ICD-10 search responds in under 20ms for common queries
- MongoDB \`EXPLAIN\` shows \`TEXT\` index usage
- Redis caches frequent searches
- Search returns relevant results ranked by text score
- Migration creates the index on existing data"

gh issue create --repo "$REPO" \
  --title "Security: Missing CSRF protection on state-changing API endpoints" \
  --label "security,enhancement,high-priority" \
  --body "## Description

The API uses JWT Bearer tokens for authentication, which are not vulnerable to traditional CSRF attacks. However, the frontend stores the access token in a cookie (\`accessToken\`) as seen in \`apps/web/middleware.ts\`. Cookie-based authentication is vulnerable to CSRF attacks unless proper protections are in place.

The \`app.ts\` does not include any CSRF middleware (e.g., \`csurf\` or double-submit cookie pattern). The CORS configuration allows credentials, which means cross-origin requests with cookies are possible from allowed origins.

**Why it matters in production:** If the access token is stored in a cookie (not just memory), CSRF attacks can forge authenticated requests from malicious websites, potentially creating patients, modifying records, or initiating payments.

## Tasks

- [ ] Audit whether the access token is stored in an HttpOnly cookie or in memory/localStorage
- [ ] If stored in a cookie: implement the double-submit cookie CSRF pattern
- [ ] Add \`SameSite=Strict\` or \`SameSite=Lax\` to the access token cookie
- [ ] Add \`HttpOnly\` and \`Secure\` flags to the access token cookie
- [ ] Add a \`X-CSRF-Token\` header requirement for state-changing requests
- [ ] Update the frontend to include the CSRF token in all mutation requests
- [ ] Write tests for CSRF protection
- [ ] Document the CSRF protection strategy in \`SECURITY.md\`

## Acceptance Criteria

- Access token cookie has \`HttpOnly\`, \`Secure\`, and \`SameSite=Strict\` flags
- State-changing requests without a valid CSRF token are rejected with 403
- Frontend includes CSRF token in all POST/PUT/DELETE requests
- CSRF protection tests pass
- \`SECURITY.md\` documents the approach"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add comprehensive E2E tests for Stellar payment flow" \
  --label "testing,blockchain,enhancement" \
  --body "## Description

The \`apps/web/e2e/payment-flow.spec.ts\` file exists but contains only basic payment flow tests. The Stellar payment integration involves multiple complex steps: creating a payment intent, waiting for blockchain confirmation, handling failed transactions, and processing refunds. These flows are not covered by the existing E2E tests.

The \`apps/api/src/modules/payments/payments.controller.test.ts\` has unit tests but they mock the stellar-service, so the actual blockchain interaction is never tested end-to-end.

**Why it matters in production:** Payment failures are the highest-severity incidents in a healthcare payment system. Without E2E tests covering the full payment lifecycle, regressions in payment flows may only be discovered in production.

## Tasks

- [ ] Expand \`payment-flow.spec.ts\` to cover: payment intent creation, QR code display, payment confirmation polling, success state, and failure state
- [ ] Add E2E test for the refund flow
- [ ] Add E2E test for claimable balance creation and claiming
- [ ] Mock the Stellar testnet in E2E tests using a local Stellar test server or recorded responses
- [ ] Add E2E test for payment dispute creation and resolution
- [ ] Add E2E test for the fee estimate display
- [ ] Configure Playwright to record videos on failure for payment tests
- [ ] Add the payment E2E tests to the CI pipeline

## Acceptance Criteria

- E2E tests cover the complete payment lifecycle (create → confirm → receipt)
- E2E tests cover payment failure and retry scenarios
- E2E tests cover the refund flow
- All payment E2E tests pass in CI
- Test videos are uploaded as artifacts on failure"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient merge audit trail and undo capability" \
  --label "enhancement,compliance,data-integrity" \
  --body "## Description

The \`apps/api/src/modules/patients/merge.service.ts\` implements patient record merging (combining duplicate patient records). However, the merge operation does not create a detailed audit trail of what was merged, and there is no undo/rollback capability.

In a HIPAA environment, merging patient records is a high-risk operation. If two patients are incorrectly merged (e.g., two patients with similar names), the merged record may contain mixed PHI from two different individuals, which is a serious HIPAA violation.

**Why it matters in production:** An incorrect patient merge could result in a clinician viewing the wrong patient's medical history, leading to misdiagnosis or incorrect treatment. HIPAA requires a complete audit trail for all PHI modifications.

## Tasks

- [ ] Add a \`MergeLogModel\` that records the full state of both records before merge
- [ ] Store the merge operation in the audit log with \`action: 'PATIENT_MERGE'\`
- [ ] Add a \`POST /api/v1/patients/:id/unmerge\` endpoint that restores the original records
- [ ] Require CLINIC_ADMIN or SUPER_ADMIN role for merge operations
- [ ] Add a confirmation step (require explicit \`confirm: true\` in the request body)
- [ ] Send an email notification to the clinic admin when a merge is performed
- [ ] Write tests for merge, audit trail, and unmerge operations
- [ ] Add the \`PATIENT_MERGE\` action to the \`AuditAction\` type in \`audit.model.ts\`

## Acceptance Criteria

- Every patient merge creates an audit log entry with full before/after state
- Merge operations require CLINIC_ADMIN or SUPER_ADMIN role
- Unmerge restores both original records exactly
- Email notification is sent on merge
- Tests cover merge, audit, and unmerge flows"

gh issue create --repo "$REPO" \
  --title "Performance: Dashboard aggregation queries run without indexes — slow on large datasets" \
  --label "performance,database,enhancement" \
  --body "## Description

In \`apps/api/src/modules/dashboard/dashboard.controller.ts\`, the dashboard endpoint runs multiple MongoDB aggregation pipelines to compute statistics (patient counts, encounter counts, payment totals, etc.). These aggregations filter by \`clinicId\` and date ranges but rely on the basic \`clinicId\` index.

For clinics with large datasets (10,000+ patients, 50,000+ encounters), these aggregations can take several seconds, causing the dashboard to load slowly. The aggregations also run sequentially in some cases rather than in parallel.

**Why it matters in production:** The dashboard is the first screen clinicians see after login. A slow dashboard creates a poor first impression and reduces productivity.

## Tasks

- [ ] Add compound indexes optimized for dashboard aggregations: \`{ clinicId: 1, createdAt: -1 }\` on patients, encounters, and payments
- [ ] Refactor dashboard queries to run in parallel using \`Promise.all\`
- [ ] Add Redis caching for dashboard statistics with a 5-minute TTL
- [ ] Add a cache invalidation trigger when new patients/encounters/payments are created
- [ ] Add a \`?refresh=true\` query parameter to force cache bypass
- [ ] Write a performance test for the dashboard endpoint
- [ ] Add a Prometheus metric for dashboard query time

## Acceptance Criteria

- Dashboard loads in under 500ms for clinics with 10,000+ records
- Dashboard statistics are cached in Redis for 5 minutes
- Cache is invalidated when new records are created
- \`?refresh=true\` bypasses the cache
- Performance test documents the improvement"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add two-factor authentication enforcement for DOCTOR role" \
  --label "security,enhancement,compliance" \
  --body "## Description

In \`apps/api/src/modules/auth/auth.controller.ts\`, MFA is required for \`CLINIC_ADMIN\` and \`SUPER_ADMIN\` roles:

\`\`\`ts
const MFA_REQUIRED_ROLES = new Set(['CLINIC_ADMIN', 'SUPER_ADMIN']);
\`\`\`

However, \`DOCTOR\` and \`NURSE\` roles are not required to enable MFA. Doctors have full read/write access to patient PHI, prescriptions, and encounter records. HIPAA's technical safeguard requirements recommend MFA for all users with access to ePHI.

**Why it matters in production:** A compromised doctor account without MFA gives an attacker full access to all patient records in the clinic. This is a significant HIPAA risk.

## Tasks

- [ ] Add \`DOCTOR\` and \`NURSE\` to \`MFA_REQUIRED_ROLES\` in \`auth.controller.ts\`
- [ ] Add a grace period (e.g., 7 days) for existing users to set up MFA before enforcement
- [ ] Add a \`mfaGracePeriodEndsAt\` field to the \`UserModel\`
- [ ] Return a \`mfa_required\` warning in the login response for users in the grace period
- [ ] Add a Prometheus metric for MFA adoption rate by role
- [ ] Send email reminders to users who haven't set up MFA before the grace period ends
- [ ] Update the frontend to show an MFA setup prompt for affected roles
- [ ] Write tests for the grace period logic

## Acceptance Criteria

- DOCTOR and NURSE roles are required to enable MFA
- Existing users get a 7-day grace period before enforcement
- Login returns a warning during the grace period
- After the grace period, login is blocked until MFA is set up
- Email reminders are sent 3 days and 1 day before the grace period ends"

gh issue create --repo "$REPO" \
  --title "Enhancement: Implement encounter co-signature workflow notifications via Socket.IO" \
  --label "enhancement,realtime,clinical" \
  --body "## Description

The \`apps/api/src/modules/encounters/cosignature.service.ts\` and \`cosignature.controller.ts\` implement a co-signature workflow where encounters require a second doctor's signature. However, when a co-signature is requested, the attending doctor is not notified in real-time via Socket.IO.

The \`emitToUser\` function in \`apps/api/src/realtime/socket.ts\` is available but not used in the cosignature flow. Doctors must manually check for pending co-signature requests, which delays encounter finalization.

**Why it matters in production:** Delayed co-signatures can hold up patient discharge, billing, and care plan activation. Real-time notifications would significantly improve clinical workflow efficiency.

## Tasks

- [ ] Emit a \`cosignature:requested\` Socket.IO event to the target doctor's user room when a co-signature is requested
- [ ] Emit a \`cosignature:completed\` event to the requesting doctor when the co-signature is provided
- [ ] Emit a \`cosignature:rejected\` event when the co-signature is rejected
- [ ] Add a notification record to \`NotificationModel\` for each co-signature event
- [ ] Update the frontend to display a real-time notification badge for pending co-signatures
- [ ] Add a \`GET /api/v1/encounters/pending-cosignatures\` endpoint
- [ ] Write tests for the Socket.IO event emission
- [ ] Update Swagger docs for the cosignature endpoints

## Acceptance Criteria

- Doctors receive real-time Socket.IO notifications for co-signature requests
- Notifications are also persisted in the \`NotificationModel\`
- The frontend displays a badge count for pending co-signatures
- \`GET /api/v1/encounters/pending-cosignatures\` returns the correct list
- Tests verify Socket.IO event emission"

echo "Issues 21-30 created successfully"
