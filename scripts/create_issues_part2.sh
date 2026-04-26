#!/bin/bash
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "CORS not configured — web app blocked by browsers in all non-local environments" \
  --label "enhancement" \
  --body "**Branch:** \`feat/cors-configuration\`
**Timeframe:** 3 hours

## Description
\`app.ts\` has no CORS middleware. When the Next.js web app (port 3000) makes requests to the API (port 3001), browsers block them. In production, every API call will fail with a CORS error.

## Tasks
- Install \`cors\` npm package and \`@types/cors\`
- Add \`ALLOWED_ORIGINS\` to \`.env.example\` as a comma-separated list
- Configure \`cors({ origin: allowedOrigins, credentials: true })\` in \`app.ts\` before route registration
- Ensure preflight \`OPTIONS\` requests are handled correctly

## Acceptance Criteria
- A browser fetch from \`http://localhost:3000\` to \`http://localhost:3001/api/v1/patients\` succeeds without CORS errors
- A request from an unlisted origin is rejected with \`403\`
- CORS config is driven by env vars, not hardcoded"

gh issue create --repo "$REPO" \
  --title "No rate limiting — login endpoint vulnerable to brute-force attacks" \
  --label "security" \
  --body "**Branch:** \`feat/rate-limiting\`
**Timeframe:** 1 day

## Description
No rate limiting exists on any endpoint. The \`/auth/login\` endpoint accepts unlimited requests per second from any IP. An attacker can attempt millions of password combinations without any throttling.

## Tasks
- Install \`express-rate-limit\`
- Apply strict limiter to auth routes: max 10 requests per 15 minutes per IP
- Apply general limiter to all API routes: max 100 requests per minute per IP
- Store rate limit state in Redis for multi-instance deployments
- Return \`429 Too Many Requests\` with \`{ error: 'RateLimitExceeded', retryAfter: number }\`

## Acceptance Criteria
- The 11th login attempt within 15 minutes from the same IP returns \`429\`
- Rate limit headers are present on all API responses
- Rate limit state persists across server restarts when Redis is configured"

gh issue create --repo "$REPO" \
  --title "No \`helmet\` security headers — API exposes sensitive server information" \
  --label "security" \
  --body "**Branch:** \`feat/helmet-security-headers\`
**Timeframe:** 2 hours

## Description
\`app.ts\` does not use \`helmet\`. Without it, Express sends default headers that expose server information (\`X-Powered-By: Express\`) and omit critical security headers. For a HIPAA-regulated healthcare application, these headers are a compliance requirement.

## Tasks
- Install \`helmet\`
- Add \`app.use(helmet())\` as the very first middleware in \`app.ts\`
- Configure \`helmet.contentSecurityPolicy()\` with appropriate directives
- Disable \`X-Powered-By\` explicitly

## Acceptance Criteria
- API responses include \`X-Content-Type-Options: nosniff\`
- API responses include \`X-Frame-Options: DENY\`
- \`X-Powered-By\` header is absent from all responses
- \`Strict-Transport-Security\` is present in production"

gh issue create --repo "$REPO" \
  --title "Stellar service accepts private key in HTTP request body — critical security vulnerability" \
  --label "security" \
  --body "**Branch:** \`fix/remove-secret-from-request-body\`
**Timeframe:** 1 day

## Description
\`POST /intent\` requires \`fromSecret\` (the Stellar private key) in the JSON request body. This means the private key travels over HTTP, is logged by any request logger, and visible to any middleware or proxy. This is the most critical security issue in the codebase.

## Tasks
- Remove \`fromSecret\` from the \`/intent\` request body entirely
- The stellar-service must use its own server-side keypair loaded from \`config.stellar.secretKey\` (env var)
- If \`STELLAR_SECRET_KEY\` is not set, the service must refuse to start
- Add a warning log on startup if \`STELLAR_NETWORK=mainnet\`

## Acceptance Criteria
- \`POST /intent\` request body contains only \`{ toPublic, amount, assetCode?, issuer? }\`
- The server keypair is loaded from env, never from the request
- Starting the service without \`STELLAR_SECRET_KEY\` exits with code 1 and a clear error
- No request body field named \`secret\`, \`privateKey\`, \`fromSecret\`, or similar exists on any endpoint"

gh issue create --repo "$REPO" \
  --title "Stellar service has no authentication — publicly accessible blockchain operations" \
  --label "security" \
  --body "**Branch:** \`feat/stellar-service-auth\`
**Timeframe:** 1 day

## Description
All three stellar-service endpoints are completely unauthenticated. Anyone who can reach the service's port can trigger Stellar transactions and potentially drain the platform's Stellar account.

## Tasks
- Add a shared secret mechanism: the API service sends an \`X-Internal-Secret\` header on all requests to the stellar-service
- Add \`STELLAR_INTERNAL_SECRET\` to \`.env.example\`
- Create middleware in stellar-service that validates this header on all routes
- Reject requests with missing or incorrect secret with \`401\`
- Bind the stellar-service to \`127.0.0.1\` only in production

## Acceptance Criteria
- A request to \`POST /intent\` without the correct \`X-Internal-Secret\` header returns \`401\`
- The secret is loaded from env, not hardcoded
- The stellar-service does not listen on \`0.0.0.0\` in production"

gh issue create --repo "$REPO" \
  --title "No pagination on list endpoints — unbounded DB queries" \
  --label "enhancement" \
  --body "**Branch:** \`feat/pagination-list-endpoints\`
**Timeframe:** 2 days

## Description
\`GET /patients/search\` uses a hardcoded \`.limit(20)\`. No list endpoint supports \`page\` or \`limit\` query parameters. As the patient database grows, queries will return increasingly large payloads and eventually time out.

## Tasks
- Add \`GET /api/v1/patients\` returning a paginated list filtered by \`clinicId\`
- Implement offset pagination with \`?page=1&limit=20\` query params (max limit: 100)
- Return a consistent pagination envelope: \`{ data: [], meta: { total, page, limit, totalPages } }\`
- Apply the same pagination pattern to \`GET /encounters/patient/:patientId\`
- Create a reusable \`paginate(model, query, page, limit)\` utility

## Acceptance Criteria
- \`GET /patients?page=2&limit=10\` returns the correct slice of records
- \`meta.total\` reflects the true count for the clinic
- \`limit\` above 100 is clamped or rejected with \`400\`"

gh issue create --repo "$REPO" \
  --title "MongoDB \`\$regex\` search is unindexed and vulnerable to ReDoS" \
  --label "security" \
  --body "**Branch:** \`fix/patient-search-text-index\`
**Timeframe:** 1 day

## Description
\`patients.controller.ts\` uses \`{ \$regex: q, \$options: 'i' }\` on \`firstName\` and \`lastName\` fields. Unanchored regex queries cannot use indexes and perform full collection scans. A malicious user can send a crafted regex-like string causing catastrophic backtracking, consuming 100% CPU.

## Tasks
- Replace the \`\$regex\` query with MongoDB \`\$text\` search using the existing text index
- Add input validation: \`q\` must be a string, min 2 chars, max 100 chars, stripped of special regex characters
- Add \`patientSearchQuerySchema\` validation middleware to the search route

## Acceptance Criteria
- \`GET /patients/search?q=john\` uses the text index (verify with \`explain()\`)
- \`GET /patients/search?q=\` returns \`400\`
- No full collection scan occurs on any search query"

gh issue create --repo "$REPO" \
  --title "No update or delete endpoints for patients or encounters" \
  --label "enhancement" \
  --body "**Branch:** \`feat/patient-encounter-update-delete\`
**Timeframe:** 3 days

## Description
Only \`POST\` (create) and \`GET\` (read) are implemented for patients and encounters. There is no way to correct a patient's details, update an encounter's notes, or deactivate a patient record.

## Tasks
- Implement \`PATCH /api/v1/patients/:id\` — partial update of allowed fields only
- Implement \`DELETE /api/v1/patients/:id\` as a soft delete (set \`isActive: false\`)
- Implement \`PATCH /api/v1/encounters/:id\` — update \`notes\`, \`diagnosis\`, \`treatmentPlan\`, \`aiSummary\`
- Implement \`DELETE /api/v1/encounters/:id\` as soft delete
- Apply RBAC: only \`DOCTOR\`, \`CLINIC_ADMIN\`, \`SUPER_ADMIN\` can update

## Acceptance Criteria
- \`PATCH /patients/:id\` with \`{ contactNumber: '07000000000' }\` updates only that field
- \`PATCH /patients/:id\` with \`{ clinicId: 'other' }\` returns \`400\` (field not updatable)
- \`DELETE /patients/:id\` sets \`isActive: false\`, record still exists in DB
- A \`READ_ONLY\` user attempting \`PATCH /patients/:id\` receives \`403\`"

gh issue create --repo "$REPO" \
  --title "No Clinic model — \`clinicId\` references a non-existent collection" \
  --label "enhancement" \
  --body "**Branch:** \`feat/clinic-model-and-routes\`
**Timeframe:** 3 days

## Description
\`clinicId\` is used as the primary multi-tenancy key across users, patients, encounters, and payments. However, there is no \`Clinic\` model, no clinic registration endpoint, and no validation that a given \`clinicId\` actually exists.

## Tasks
- Create \`clinic.model.ts\` with fields: \`name\`, \`address\`, \`contactEmail\`, \`isActive\`, \`plan\`
- Create \`POST /api/v1/clinics\` (SUPER_ADMIN only) to register a new clinic
- Create \`GET /api/v1/clinics/:id\` for clinic details
- Add validation that \`clinicId\` exists before creating users or patients
- Update \`UserModel\` to use \`Schema.Types.ObjectId\` ref to \`Clinic\`

## Acceptance Criteria
- \`POST /auth/register\` with a non-existent \`clinicId\` returns \`404 { error: 'ClinicNotFound' }\`
- \`POST /clinics\` by a non-SUPER_ADMIN returns \`403\`
- \`GET /clinics/:id\` returns clinic details for a valid ID"

gh issue create --repo "$REPO" \
  --title "No structured logging — \`console.log\` throughout production code" \
  --label "enhancement" \
  --body "**Branch:** \`feat/structured-logging-pino\`
**Timeframe:** 1 day

## Description
\`db.ts\`, \`app.ts\`, and \`stellar-service/src/index.ts\` use \`console.log\` and \`console.error\`. In production, this produces unstructured text logs with no timestamps, no log levels, and no machine-parseable format.

## Tasks
- Install \`pino\` and \`pino-http\` in the API package
- Create \`apps/api/src/utils/logger.ts\` exporting a configured pino instance
- Replace all \`console.log\`/\`console.error\` calls with \`logger.info\`/\`logger.error\`
- Add \`pino-http\` as middleware in \`app.ts\` to log every request
- In development, use \`pino-pretty\`; in production, use JSON

## Acceptance Criteria
- Every log line in production is valid JSON with \`level\`, \`time\`, \`msg\`, \`reqId\` fields
- \`console.log\` and \`console.error\` do not appear anywhere in \`src/\` directories
- Log level is configurable via \`LOG_LEVEL\` env var (default: \`info\`)
- Sensitive fields (passwords, tokens) are never logged"
