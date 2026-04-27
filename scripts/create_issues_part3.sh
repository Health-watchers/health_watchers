#!/bin/bash
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "No graceful shutdown — in-flight requests dropped on process exit" \
  --label "enhancement" \
  --body "**Branch:** \`feat/graceful-shutdown\`
**Timeframe:** 1 day

## Description
Neither \`app.ts\` nor \`stellar-service\` handle \`SIGTERM\` or \`SIGINT\` signals. When a container orchestrator sends \`SIGTERM\`, the process exits immediately, dropping all in-flight HTTP requests and leaving MongoDB connections open.

## Tasks
- Add \`process.on('SIGTERM', shutdown)\` and \`process.on('SIGINT', shutdown)\` in both services
- The \`shutdown\` function must: stop accepting new connections, wait for in-flight requests (10s timeout), close Mongoose connection, then exit with code 0
- Log each step of the shutdown sequence
- Add a \`SHUTDOWN_TIMEOUT_MS\` env var (default: 10000)

## Acceptance Criteria
- Sending \`SIGTERM\` to the API process logs \`Shutting down gracefully...\` and exits cleanly
- MongoDB connection is closed before process exit
- Process exits with code 0 on clean shutdown, code 1 on forced timeout"

gh issue create --repo "$REPO" \
  --title "\`packages/config/index.ts\` resolves \`.env\` path relative to \`__dirname\` — breaks in production builds" \
  --label "bug" \
  --body "**Branch:** \`fix/config-dotenv-entry-point\`
**Timeframe:** 3 hours

## Description
\`packages/config/index.ts\` calls \`dotenv.config({ path: path.resolve(__dirname, '../../.env') })\`. When TypeScript is compiled to \`dist/\`, \`__dirname\` points to \`packages/config/dist/\` and the relative path resolves to a completely different location.

## Tasks
- Remove the \`dotenv.config()\` call from \`packages/config/index.ts\`
- Load \`.env\` once at the application entry point (\`app.ts\` and \`stellar-service/src/index.ts\`)
- Add startup env validation using \`zod\` to parse and validate all required env vars
- Export the validated, typed config object

## Acceptance Criteria
- \`npm run build && npm run start\` works correctly with env vars set in the shell (no \`.env\` file needed)
- Starting without required env vars prints a clear validation error listing missing vars
- \`dotenv.config()\` is called exactly once per process"

gh issue create --repo "$REPO" \
  --title "No payment confirmation flow — payment records stuck in \`pending\` forever" \
  --label "enhancement" \
  --body "**Branch:** \`feat/payment-confirmation-flow\`
**Timeframe:** 3 days

## Description
\`POST /payments/intent\` creates a payment record with \`status: 'pending'\` but there is no endpoint to confirm that the on-chain transaction actually occurred. Payment records will remain \`pending\` indefinitely.

## Tasks
- Implement \`POST /api/v1/payments/confirm\` accepting \`{ intentId, txHash }\`
- Call the stellar-service \`GET /verify/:hash\` to fetch the on-chain transaction
- Verify the transaction: correct destination, amount, and memo
- Update \`PaymentRecordModel\` to \`status: 'confirmed'\` or \`'failed'\`
- Add a background job that auto-expires \`pending\` intents older than 30 minutes

## Acceptance Criteria
- \`POST /payments/confirm\` with a valid \`txHash\` updates status to \`confirmed\`
- \`POST /payments/confirm\` with a mismatched amount updates status to \`failed\`
- Payment records older than 30 minutes with \`pending\` status are automatically marked \`failed\`"

gh issue create --repo "$REPO" \
  --title "No NoSQL injection sanitization" \
  --label "security" \
  --body "**Branch:** \`feat/nosql-injection-sanitization\`
**Timeframe:** 3 hours

## Description
\`req.body\`, \`req.query\`, and \`req.params\` are passed to Mongoose queries without sanitizing MongoDB operators. An attacker can send \`{ \"email\": { \"\$gt\": \"\" } }\` in the login body to bypass email matching.

## Tasks
- Install \`express-mongo-sanitize\`
- Add \`app.use(mongoSanitize())\` in \`app.ts\` after \`express.json()\` but before routes
- Configure it to replace prohibited characters (\`\$\`, \`.\`) rather than remove the key entirely

## Acceptance Criteria
- \`POST /auth/login\` with \`{ \"email\": { \"\$gt\": \"\" }, \"password\": \"test\" }\` returns \`400\`, not \`200\` or \`401\`
- \`express-mongo-sanitize\` is listed in \`apps/api/package.json\` dependencies
- Existing valid requests are unaffected"

gh issue create --repo "$REPO" \
  --title "No request body size limit — potential DoS via large payloads" \
  --label "security" \
  --body "**Branch:** \`feat/request-body-size-limit\`
**Timeframe:** 3 hours

## Description
\`app.use(express.json())\` is called with no size limit. Without an explicit limit, an attacker can send multi-megabyte JSON payloads to exhaust memory and CPU.

## Tasks
- Set an explicit body size limit: \`app.use(express.json({ limit: '50kb' }))\` for standard routes
- For the AI summarize endpoint, allow a larger limit (e.g. \`500kb\`) via a separate middleware
- Return \`413 Payload Too Large\` for oversized requests
- Make the limit configurable via env var \`MAX_REQUEST_BODY_SIZE\`

## Acceptance Criteria
- A \`POST /patients\` request with a 100kb JSON body returns \`413\`
- A \`POST /patients\` request with a 1kb JSON body succeeds normally"

gh issue create --repo "$REPO" \
  --title "\`EncounterModel\` missing critical clinical fields" \
  --label "enhancement" \
  --body "**Branch:** \`feat/encounter-clinical-fields\`
**Timeframe:** 2 days

## Description
The encounter schema only has \`chiefComplaint\`, \`notes\`, and \`aiSummary\`. A real EMR encounter record requires structured clinical data including diagnosis codes, vital signs, prescriptions, and the attending clinician.

## Tasks
- Add fields: \`diagnosis\`, \`vitalSigns\`, \`prescriptions\`, \`treatmentPlan\`, \`followUpDate\`, \`attendingDoctorId\`, \`status\`
- Update the encounter validation schema to match
- Add indexes on \`attendingDoctorId\` and \`status\`

## Acceptance Criteria
- \`POST /encounters\` accepts and stores all new fields
- \`vitalSigns\` sub-document fields are all optional individually
- Existing encounter records without new fields are not broken"

gh issue create --repo "$REPO" \
  --title "No \`GET /api/v1/encounters\` list endpoint" \
  --label "enhancement" \
  --body "**Branch:** \`feat/encounters-list-endpoint\`
**Timeframe:** 1 day

## Description
The encounters module only has \`POST /\`, \`GET /:id\`, and \`GET /patient/:patientId\`. There is no endpoint to list all encounters for a clinic. The web encounters page always shows an empty list.

## Tasks
- Implement \`GET /api/v1/encounters\` with pagination, filtered by \`clinicId\`
- Support optional query filters: \`?patientId=\`, \`?doctorId=\`, \`?status=\`, \`?date=\`
- Return the pagination envelope consistent with other list endpoints
- Apply \`authenticate\` and \`authorize\` middleware

## Acceptance Criteria
- \`GET /encounters\` returns a paginated list of encounters for the authenticated user's clinic
- \`GET /encounters?status=completed\` filters correctly
- \`GET /encounters?date=2026-03-20\` returns only encounters from that day"

gh issue create --repo "$REPO" \
  --title "No \`GET /api/v1/payments\` list endpoint" \
  --label "enhancement" \
  --body "**Branch:** \`feat/payments-list-endpoint\`
**Timeframe:** 1 day

## Description
The payments module only has \`POST /intent\`, \`GET /status/:intentId\`, and the unimplemented \`POST /confirm\`. The web payments page fetches \`GET /api/v1/payments\` which doesn't exist.

## Tasks
- Implement \`GET /api/v1/payments\` with pagination, filtered by \`clinicId\`
- Support optional filters: \`?status=pending|confirmed|failed\`, \`?patientId=\`
- Include \`patientId\`, \`amount\`, \`status\`, \`txHash\`, \`createdAt\`, \`confirmedAt\` in the response
- Apply authentication and RBAC (CLINIC_ADMIN and above)

## Acceptance Criteria
- \`GET /payments\` returns paginated payment records for the clinic
- \`GET /payments?status=confirmed\` returns only confirmed payments
- Unauthenticated requests return \`401\`"

gh issue create --repo "$REPO" \
  --title "No environment variable validation on startup" \
  --label "enhancement" \
  --body "**Branch:** \`feat/env-validation-on-startup\`
**Timeframe:** 1 day

## Description
The application starts successfully even when critical env vars are empty strings or missing. \`MONGO_URI=\"\"\` causes a silent connection failure. \`JWT_SECRET=\"\"\` means all tokens are signed with an empty string — trivially forgeable.

## Tasks
- Create \`apps/api/src/config/env.ts\` using \`zod\` to define and parse all required env vars
- Required vars: \`MONGO_URI\`, \`JWT_ACCESS_SECRET\`, \`JWT_REFRESH_SECRET\`, \`API_PORT\`
- If validation fails, print a table of missing/invalid vars and call \`process.exit(1)\`
- Import and run env validation as the very first line of \`app.ts\`

## Acceptance Criteria
- Starting the API without \`MONGO_URI\` prints \`Missing required env var: MONGO_URI\` and exits with code 1
- \`JWT_ACCESS_SECRET\` with fewer than 32 characters is rejected as too weak
- The validation runs before any other module is imported"

gh issue create --repo "$REPO" \
  --title "No OpenAPI / Swagger documentation — no API contract for frontend or third parties" \
  --label "enhancement" \
  --body "**Branch:** \`feat/openapi-swagger-docs\`
**Timeframe:** 3 days

## Description
There is no API documentation. Frontend developers must read controller source code to understand request/response shapes. Third-party integrators have no contract to work against.

## Tasks
- Install \`swagger-jsdoc\` and \`swagger-ui-express\`
- Create \`apps/api/src/docs/swagger.ts\` defining the OpenAPI 3.0 base document
- Add JSDoc \`@swagger\` annotations to all route handlers
- Mount Swagger UI at \`GET /api/docs\` (disabled in production or protected by basic auth)
- Add a \`GET /api/docs/openapi.json\` endpoint returning the raw spec

## Acceptance Criteria
- \`GET /api/docs\` renders the Swagger UI with all endpoints documented
- Every endpoint has documented request body schema, response schemas, and auth requirements
- The OpenAPI spec is valid (passes \`swagger-parser\` validation)"
