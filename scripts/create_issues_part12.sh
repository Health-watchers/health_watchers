#!/usr/bin/env bash
set -e

# Issues 121–133

gh issue create \
  --title "No \`GET /api/v1/payments\` list endpoint — payments page always empty" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`payments.controller.ts\` only has \`POST /intent\` and \`GET /status/:intentId\`. There is no \`GET /\` list endpoint. The web app's \`payments/page.tsx\` calls \`GET /api/v1/payments\` and receives a 404.

## Location
- \`apps/api/src/modules/payments/payments.controller.ts\`
- \`apps/web/src/app/payments/page.tsx\`

## Tasks
- [ ] Add \`GET /\` route with pagination, optional \`status\` filter (\`pending\`/\`confirmed\`/\`failed\`), optional \`patientId\` filter
- [ ] Scope to caller's \`clinicId\`
- [ ] Sort by \`createdAt\` descending
- [ ] Return \`{ status, data: PaymentRecord[], meta: { total, page, limit } }\`

## Acceptance Criteria
- [ ] \`GET /payments\` returns paginated list
- [ ] Status and patientId filters work correctly
- [ ] Web payments page renders real data"

gh issue create \
  --title "\`config.stellar.platformPublicKey\` referenced in payments controller but not defined in config — runtime crash" \
  --label "bug,Stellar Wave" \
  --body "## Problem
\`apps/api/src/modules/payments/payments.controller.ts\` references \`config.stellar.platformPublicKey\` and \`config.stellar.network\`, but \`packages/config/index.ts\` exports a flat object with \`stellarNetwork\` and \`stellarSecretKey\` — there is no nested \`stellar\` property. This causes a \`TypeError: Cannot read properties of undefined\` at runtime when creating a payment intent.

## Location
- \`apps/api/src/modules/payments/payments.controller.ts\` lines 14–15
- \`packages/config/index.ts\`

## Fix
Either:
- Add \`STELLAR_PLATFORM_PUBLIC_KEY\` to \`.env.example\` and expose it as \`config.stellarPlatformPublicKey\` in the flat config object, then fix the controller reference; or
- Restructure config to use a nested \`stellar\` object consistently.

## Acceptance Criteria
- [ ] \`POST /payments/intent\` no longer crashes with TypeError
- [ ] \`STELLAR_PLATFORM_PUBLIC_KEY\` documented in \`.env.example\`
- [ ] Config shape is consistent across all consumers"

gh issue create \
  --title "No \`PATCH /api/v1/payments/:intentId/confirm\` endpoint — payment confirmation flow not implemented in API" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
Issue #18 tracks the missing payment confirmation flow. The stellar service can verify a transaction hash via \`GET /verify/:hash\`, but the API has no endpoint to accept a \`txHash\`, call the stellar service to verify it, and update the \`PaymentRecord\` status to \`confirmed\` or \`failed\`.

## Location
\`apps/api/src/modules/payments/payments.controller.ts\`

## Tasks
- [ ] Add \`PATCH /api/v1/payments/:intentId/confirm\` accepting \`{ txHash: string }\`
- [ ] Call stellar service \`GET /verify/:hash\` to confirm the transaction exists on-chain
- [ ] On success: set \`status = 'confirmed'\`, store \`txHash\` on the record
- [ ] On failure (tx not found or wrong amount): set \`status = 'failed'\`
- [ ] Return updated payment record
- [ ] Protect with \`authenticate\` middleware

## Acceptance Criteria
- [ ] \`PATCH /payments/:intentId/confirm\` with valid txHash sets status to \`confirmed\`
- [ ] Invalid txHash sets status to \`failed\`
- [ ] Confirming an already-confirmed payment returns 409"

gh issue create \
  --title "No \`Clinic\` model — \`clinicId\` is an orphaned reference with no validation" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
Issue #14 tracks the missing Clinic model. Every model (\`User\`, \`Patient\`, \`Encounter\`, \`PaymentRecord\`) references \`clinicId\` but there is no \`Clinic\` collection. This means:
1. Any string can be used as a \`clinicId\` — no referential integrity.
2. There is no way to manage clinic settings, name, or Stellar wallet address.
3. Multi-tenancy is broken — a user from clinic A could theoretically access clinic B data if they know the ID.

## Tasks
- [ ] Create \`apps/api/src/modules/clinic/models/clinic.model.ts\` with fields: \`name\`, \`stellarPublicKey\`, \`isActive\`, \`createdAt\`
- [ ] Add \`POST /api/v1/clinics\` (SUPER_ADMIN only) to create a clinic
- [ ] Add \`GET /api/v1/clinics/:id\` (CLINIC_ADMIN of that clinic)
- [ ] Validate \`clinicId\` exists on user registration
- [ ] Add clinic routes to \`app.ts\`

## Acceptance Criteria
- [ ] \`Clinic\` model exists with required fields
- [ ] User registration validates that \`clinicId\` references an existing clinic
- [ ] \`GET /clinics/:id\` returns clinic details to authorized users"

gh issue create \
  --title "No input validation on \`POST /encounters\` — malformed data silently stored in DB" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`encounters.controller.ts\` passes \`req.body\` directly to \`EncounterModel.create()\` with no Zod validation. A caller can omit \`chiefComplaint\` (required by schema) or send \`patientId\` as a non-ObjectId string, causing a Mongoose \`ValidationError\` that propagates as an unhandled rejection (issue #9).

## Location
\`apps/api/src/modules/encounters/encounters.controller.ts\`

## Tasks
- [ ] Create \`encounters.validation.ts\` with Zod schemas for create and update
- [ ] \`createEncounterSchema\`: \`patientId\` (non-empty string), \`chiefComplaint\` (min 3 chars), \`notes\` (optional string), \`attendingDoctorId\` (optional)
- [ ] Apply \`validateRequest({ body: createEncounterSchema })\` middleware to \`POST /\`
- [ ] Return structured 400 errors on validation failure

## Acceptance Criteria
- [ ] Missing \`chiefComplaint\` returns 400 with field-level error message
- [ ] Invalid \`patientId\` format returns 400
- [ ] Valid requests still create encounter successfully"

gh issue create \
  --title "No \`attendingDoctorId\` field on \`EncounterModel\` — cannot track which doctor saw the patient" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`encounter.model.ts\` has no \`attendingDoctorId\` field. In a clinical setting, every encounter must record which doctor or nurse conducted it for accountability, billing, and audit purposes. Without this field, the encounter record is clinically incomplete.

## Location
\`apps/api/src/modules/encounters/encounter.model.ts\`

## Tasks
- [ ] Add \`attendingDoctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true }\`
- [ ] Add \`status: { type: String, enum: ['open', 'closed'], default: 'open' }\`
- [ ] Add \`vitalSigns: { bloodPressure, heartRate, temperature, weight, height }\` as optional sub-document
- [ ] Add \`diagnosis: [String]\` array field
- [ ] Add \`treatmentPlan: String\` field
- [ ] Add \`followUpDate: Date\` optional field
- [ ] Update create validation schema to include new required field

## Acceptance Criteria
- [ ] \`EncounterModel\` includes all listed fields
- [ ] \`POST /encounters\` requires \`attendingDoctorId\`
- [ ] Existing tests (when added) cover new fields"

gh issue create \
  --title "No rate limiting on auth endpoints — brute-force login attacks possible" \
  --label "security,Stellar Wave" \
  --body "## Problem
\`POST /auth/login\` and \`POST /auth/refresh\` have no rate limiting. An attacker can make unlimited login attempts per second, enabling brute-force password attacks. Issue #79 covers account lockout; this issue covers network-level rate limiting as a complementary defence.

## Location
\`apps/api/src/app.ts\`
\`apps/api/src/modules/auth/auth.controller.ts\`

## Tasks
- [ ] Install \`express-rate-limit\` in \`apps/api\`
- [ ] Apply a strict limiter to auth routes: 10 requests per 15 minutes per IP
- [ ] Apply a general API limiter: 100 requests per minute per IP
- [ ] Return \`429 Too Many Requests\` with \`Retry-After\` header
- [ ] Add \`X-RateLimit-Limit\` and \`X-RateLimit-Remaining\` headers to all responses

## Acceptance Criteria
- [ ] 11th login attempt within 15 minutes from same IP returns 429
- [ ] \`Retry-After\` header present on 429 responses
- [ ] General API limiter does not affect normal usage patterns"

gh issue create \
  --title "No helmet.js — missing security headers (X-Frame-Options, HSTS, X-Content-Type-Options, etc.)" \
  --label "security,Stellar Wave" \
  --body "## Problem
\`apps/api/src/app.ts\` uses bare Express with no security headers middleware. Without \`helmet\`, the API is missing:
- \`X-Frame-Options\` (clickjacking protection)
- \`X-Content-Type-Options: nosniff\`
- \`Strict-Transport-Security\` (HSTS)
- \`X-XSS-Protection\`
- \`Referrer-Policy\`
- \`Permissions-Policy\`

## Location
\`apps/api/src/app.ts\`

## Tasks
- [ ] Install \`helmet\` in \`apps/api\`
- [ ] Add \`app.use(helmet())\` as the first middleware in \`app.ts\`
- [ ] Configure CSP via helmet to allow only same-origin resources
- [ ] Verify headers present in \`GET /health\` response

## Acceptance Criteria
- [ ] \`GET /health\` response includes \`X-Frame-Options\`, \`X-Content-Type-Options\`, \`Strict-Transport-Security\`
- [ ] No \`X-Powered-By: Express\` header exposed"

gh issue create \
  --title "MongoDB connection never established in API — all DB operations fail silently at startup" \
  --label "bug,Stellar Wave" \
  --body "## Problem
\`apps/api/src/app.ts\` imports models and starts the Express server but never calls \`mongoose.connect()\`. The \`config.mongoUri\` value exists but is never used to open a database connection. Every request that touches a Mongoose model will throw \`MongooseError: Operation \`patients.find()\` buffering timed out after 10000ms\`.

## Location
\`apps/api/src/app.ts\`
\`packages/config/index.ts\` (\`mongoUri\` defined but unused)

## Tasks
- [ ] Add \`mongoose.connect(config.mongoUri)\` call before \`app.listen\`
- [ ] Wrap in try/catch — exit process with code 1 if connection fails
- [ ] Log connection success/failure with connection string host only (not full URI with credentials)
- [ ] Add \`mongoose.connection.on('error', ...)\` handler for post-startup errors

## Acceptance Criteria
- [ ] API connects to MongoDB on startup
- [ ] Startup fails fast with clear error if \`MONGO_URI\` is invalid
- [ ] MongoDB URI credentials not logged"

gh issue create \
  --title "No \`compression\` middleware — API responses not gzip compressed" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`apps/api/src/app.ts\` has no response compression. Patient list responses with 100+ records, encounter details with notes, and AI summaries can be several KB. Without gzip compression, bandwidth usage is unnecessarily high and response times are slower, especially on mobile connections common in healthcare settings.

## Location
\`apps/api/src/app.ts\`

## Tasks
- [ ] Install \`compression\` and \`@types/compression\` in \`apps/api\`
- [ ] Add \`app.use(compression())\` before route handlers
- [ ] Verify \`Content-Encoding: gzip\` header on list endpoint responses

## Acceptance Criteria
- [ ] \`GET /api/v1/patients\` response includes \`Content-Encoding: gzip\`
- [ ] Response size reduced by ≥ 50% for JSON payloads > 1KB"

gh issue create \
  --title "No \`morgan\` HTTP request logging — no visibility into API traffic in development or production" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`apps/api/src/app.ts\` has no HTTP request logging middleware. In development, there is no way to see which endpoints are being called, response times, or status codes without attaching a debugger. In production, this makes incident investigation impossible.

## Location
\`apps/api/src/app.ts\`

## Tasks
- [ ] Install \`morgan\` and \`@types/morgan\` in \`apps/api\`
- [ ] Use \`'dev'\` format in development, \`'combined'\` in production
- [ ] Ensure \`/health\` endpoint logs are suppressed in production (noise reduction)
- [ ] Integrate with structured logger from issue #15 when implemented

## Acceptance Criteria
- [ ] Every API request logs method, path, status, and response time
- [ ] Log format differs between \`NODE_ENV=development\` and \`production\`"

gh issue create \
  --title "No \`404\` catch-all handler — unknown routes return Express default HTML error page" \
  --label "bug,Stellar Wave" \
  --body "## Problem
\`apps/api/src/app.ts\` has no catch-all route handler. Requests to undefined endpoints (e.g. \`GET /api/v1/unknown\`) return Express's default HTML 404 page instead of a JSON error response. This breaks any API client that expects JSON and exposes the Express version in the HTML body.

## Location
\`apps/api/src/app.ts\`

## Tasks
- [ ] Add a catch-all \`app.use((req, res) => res.status(404).json({ error: 'NotFound', message: \`Route \${req.method} \${req.path} not found\` }))\` after all route registrations
- [ ] Add a global error handler \`app.use((err, req, res, next) => ...)\` that returns JSON 500 for unhandled errors

## Acceptance Criteria
- [ ] \`GET /api/v1/nonexistent\` returns \`{ error: 'NotFound', message: '...' }\` with status 404
- [ ] Unhandled thrown errors return JSON 500, not HTML
- [ ] Express version not exposed in error responses"

gh issue create \
  --title "No \`tsconfig\` path aliases in \`apps/api\` — deep relative imports like \`../../../middlewares/auth\`" \
  --label "chore,Stellar Wave" \
  --body "## Problem
Files in \`apps/api/src/modules/*/\` use deep relative imports such as \`../../middlewares/auth.middleware\` and \`../../types/express\`. As the module tree grows, these become fragile and hard to refactor. TypeScript path aliases (\`@/middlewares/*\`, \`@/modules/*\`) would make imports clean and refactor-safe.

## Location
\`apps/api/tsconfig.json\`
All files under \`apps/api/src/modules/\`

## Tasks
- [ ] Add \`paths\` to \`apps/api/tsconfig.json\`: \`\"@/*\": [\"./src/*\"]\`
- [ ] Install \`tsconfig-paths\` or configure \`ts-node\` to resolve aliases at runtime
- [ ] Update all deep relative imports in \`apps/api/src\` to use \`@/\` prefix
- [ ] Verify build still passes after alias changes

## Acceptance Criteria
- [ ] No import in \`apps/api/src\` uses more than one \`../\` level
- [ ] \`npm run build\` passes with aliases configured
- [ ] \`ts-node\` resolves aliases correctly in development"
