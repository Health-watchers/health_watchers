#!/bin/bash
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "Stub routes override real controller implementations" \
  --label "bug" \
  --body "**Branch:** \`fix/wire-controller-routes\`
**Timeframe:** 1 day

## Description
\`encounters.controller.ts\` passes \`req.body\` directly to \`EncounterModel.create()\` with no Zod validation. \`payments.controller.ts\` only destructures \`amount\` from \`req.body\` with no type or range checks. Missing required fields (e.g. \`patientId\`, \`chiefComplaint\`) will either cause a Mongoose validation error (unhandled) or silently create incomplete records.

## Tasks
- Create \`encounter.validation.ts\` with a Zod schema requiring \`patientId\`, \`chiefComplaint\` (min 3 chars), optional \`notes\` (max 5000 chars)
- Create \`payments.validation.ts\` with a Zod schema requiring \`amount\` (positive numeric string), \`patientId\`
- Apply \`validateRequest({ body: schema })\` middleware to all POST/PATCH routes
- Validate \`:id\` and \`:patientId\` path params as valid MongoDB ObjectId strings

## Acceptance Criteria
- \`POST /encounters\` with missing \`chiefComplaint\` returns \`400\` with a Zod issues array
- \`POST /payments/intent\` with \`amount: -5\` returns \`400\`
- \`GET /encounters/not-a-valid-id\` returns \`400\`, not a Mongoose CastError 500"

gh issue create --repo "$REPO" \
  --title "\`connectDB()\` is never called — app starts without a database connection" \
  --label "bug" \
  --body "**Branch:** \`fix/connect-db-on-startup\`
**Timeframe:** 2 hours

## Description
\`apps/api/src/config/db.ts\` exports a \`connectDB()\` function but \`app.ts\` never imports or calls it. The server starts and accepts requests, but every DB operation throws a Mongoose 'not connected' error.

## Tasks
- Import \`connectDB\` in \`app.ts\`
- Call \`await connectDB()\` before \`app.listen()\`
- Wrap startup in an async IIFE or \`main()\` function
- Add a startup log confirming DB connection

## Acceptance Criteria
- \`npm run dev\` logs \`✅ MongoDB Connected\` before \`API running on port ...\`
- \`POST /api/v1/auth/login\` successfully queries the users collection
- If \`MONGO_URI\` is invalid, process exits with non-zero code and clear error"

gh issue create --repo "$REPO" \
  --title "\`config\` object missing \`jwt\` and \`stellar\` namespaces — runtime crash on startup" \
  --label "bug" \
  --body "**Branch:** \`fix/config-jwt-stellar-namespaces\`
**Timeframe:** 3 hours

## Description
\`packages/config/index.ts\` exports a flat config with \`jwtSecret\`. However \`token.service.ts\` accesses \`config.jwt.accessTokenSecret\` and \`config.jwt.refreshTokenSecret\`, and \`payments.controller.ts\` accesses \`config.stellar.platformPublicKey\`. Both throw \`TypeError: Cannot read properties of undefined\`.

## Tasks
- Restructure config to export nested namespaces: \`jwt\` and \`stellar\`
- Add \`JWT_ACCESS_SECRET\`, \`JWT_REFRESH_SECRET\`, \`STELLAR_PLATFORM_PUBLIC_KEY\` to \`.env.example\`
- Update all consumers to use the new structure
- Add startup validation that throws if any required key is empty

## Acceptance Criteria
- \`config.jwt.accessTokenSecret\` resolves to a non-empty string at runtime
- Starting with missing env vars prints a descriptive error and exits with code 1
- All usages of \`config.jwtSecret\` are removed"

gh issue create --repo "$REPO" \
  --title "No global error handler — unhandled async errors crash or hang requests" \
  --label "enhancement" \
  --body "**Branch:** \`fix/global-error-handler\`
**Timeframe:** 1 day

## Description
\`app.ts\` registers no Express error-handling middleware. Every async route handler has no try/catch. When Mongoose throws, the error propagates as an unhandled promise rejection, crashing the process or leaving requests hanging.

## Tasks
- Create \`error.middleware.ts\` with a typed Express error handler
- Distinguish between operational errors (Mongoose \`ValidationError\`, \`CastError\`, JWT errors) and unexpected errors
- Return structured JSON: \`{ error, message, ...(dev ? { stack } : {}) }\`
- Register as the last \`app.use()\` in \`app.ts\`
- Create \`asyncHandler\` wrapper and apply to all async route handlers
- Handle \`404\` routes

## Acceptance Criteria
- A Mongoose validation error on \`POST /patients\` returns \`400\` JSON, not a hanging request
- Unexpected errors return \`500 { error: 'InternalServerError' }\` — no stack trace in production
- Unmatched routes return \`404 { error: 'NotFound' }\`"

gh issue create --repo "$REPO" \
  --title "No \`POST /auth/register\` implementation" \
  --label "enhancement" \
  --body "**Branch:** \`feat/auth-register-endpoint\`
**Timeframe:** 2 days

## Description
The stub router has a \`/register\` route returning 501. There is no way to create user accounts — even a super admin cannot be created through the API.

## Tasks
- Implement \`POST /api/v1/auth/register\` in \`auth.controller.ts\`
- Accept \`{ fullName, email, password, role, clinicId }\`
- Validate with a \`registerSchema\` Zod schema (password min 8 chars, valid role enum, valid email)
- Check for duplicate email and return \`409 Conflict\` if found
- Hash password via bcrypt (salt rounds: 12)
- Return \`201\` with \`{ accessToken, refreshToken }\` on success
- Protect route: only \`SUPER_ADMIN\` can create \`CLINIC_ADMIN\` accounts

## Acceptance Criteria
- \`POST /auth/register\` with valid body returns \`201\` and both tokens
- Duplicate email returns \`409 { error: 'Conflict', message: 'Email already in use' }\`
- Password is stored as a bcrypt hash, never plaintext
- A \`DOCTOR\` cannot register a \`SUPER_ADMIN\` account (returns \`403\`)"

gh issue create --repo "$REPO" \
  --title "No refresh token rotation or revocation — stolen tokens valid for 7 days" \
  --label "enhancement" \
  --body "**Branch:** \`feat/refresh-token-rotation\`
**Timeframe:** 3 days

## Description
Refresh tokens are stateless JWTs that cannot be invalidated before their 7-day expiry. A stolen token gives an attacker silent access for 7 days. There is also no logout endpoint.

## Tasks
- Add \`refreshTokenHash\` field to \`UserModel\` (hashed with SHA-256)
- On \`POST /auth/refresh\`: verify token, check hash, issue new tokens, store new hash, invalidate old
- Implement \`POST /api/v1/auth/logout\` that clears \`refreshTokenHash\`
- On login, store the new refresh token hash
- If a refresh token is reused after rotation, treat as token theft: clear all tokens, return \`401\`

## Acceptance Criteria
- After \`POST /auth/logout\`, using the old refresh token returns \`401\`
- Reuse of a rotated refresh token clears the stored hash and returns \`401\`
- \`UserModel\` has a \`refreshTokenHash\` field that is \`select: false\`"

gh issue create --repo "$REPO" \
  --title "Duplicate and conflicting patient model files" \
  --label "bug" \
  --body "**Branch:** \`fix/remove-duplicate-patient-model\`
**Timeframe:** 3 hours

## Description
Two patient model files exist with conflicting schemas (\`gender\` vs \`sex\`, missing \`systemId\`). \`patients.controller.ts\` imports the old model while \`patients.validation.ts\` uses \`sex\` from the new model, causing create-patient requests to fail Mongoose validation.

## Tasks
- Delete \`apps/api/src/modules/patients/patient.model.ts\` (the old file)
- Update \`patients.controller.ts\` to import from \`./models/patient.model\`
- Audit all other files that may import the old model path

## Acceptance Criteria
- Only one patient model file exists in the codebase
- \`POST /api/v1/patients\` with \`{ firstName, lastName, dateOfBirth, sex, contactNumber, address }\` creates a record successfully
- \`npm run build\` completes without errors"

gh issue create --repo "$REPO" \
  --title "\`systemId\` not auto-generated — required field left to caller" \
  --label "enhancement" \
  --body "**Branch:** \`feat/auto-generate-system-id\`
**Timeframe:** 1 day

## Description
\`models/patient.model.ts\` marks \`systemId\` as \`required: true\` and \`unique: true\`. The controller does \`PatientModel.create({ ...req.body, clinicId })\`, meaning the caller must supply \`systemId\`. This is a data integrity and security risk.

## Tasks
- Use \`PatientCounterModel\` to atomically increment and retrieve the next counter value for the given \`clinicId\`
- Format \`systemId\` as \`HW-{clinicId_short}-{paddedNumber}\`
- Strip \`systemId\` from \`req.body\` before passing to \`PatientModel.create()\`
- Auto-generate \`searchName\` as \`\${lastName.toLowerCase()} \${firstName.toLowerCase()}\`

## Acceptance Criteria
- \`POST /api/v1/patients\` never requires \`systemId\` in the request body
- Two concurrent patient creation requests never produce the same \`systemId\`
- \`searchName\` is automatically set and kept in sync on updates"

gh issue create --repo "$REPO" \
  --title "All async route handlers missing try/catch — DB errors cause unhandled rejections" \
  --label "bug" \
  --body "**Branch:** \`fix/async-handler-all-routes\`
**Timeframe:** 1 day

## Description
\`patients.controller.ts\`, \`encounters.controller.ts\`, and \`payments.controller.ts\` all contain async route handlers with no try/catch. Any Mongoose error will result in an unhandled promise rejection, crashing the Node process or leaving HTTP requests hanging.

## Tasks
- Create \`asyncHandler.ts\` that wraps async route handlers and forwards errors to \`next(err)\`
- Apply \`asyncHandler\` to every async route handler across all controllers
- Alternatively, install \`express-async-errors\` and import it once at the top of \`app.ts\`

## Acceptance Criteria
- Simulating a DB timeout on any endpoint returns a \`500\` JSON response, not a hanging request
- No \`UnhandledPromiseRejectionWarning\` appears in logs
- All async handlers are wrapped consistently"

gh issue create --repo "$REPO" \
  --title "No input validation on encounter and payment routes" \
  --label "enhancement" \
  --body "**Branch:** \`feat/validate-encounter-payment-input\`
**Timeframe:** 1 day

## Description
\`encounters.controller.ts\` passes \`req.body\` directly to \`EncounterModel.create()\` with no Zod validation. \`payments.controller.ts\` only destructures \`amount\` with no type or range checks.

## Tasks
- Create \`encounter.validation.ts\` with Zod schema requiring \`patientId\`, \`chiefComplaint\` (min 3 chars), optional \`notes\` (max 5000 chars)
- Create \`payments.validation.ts\` with Zod schema requiring \`amount\` (positive numeric string), \`patientId\`
- Apply \`validateRequest\` middleware to all POST/PATCH routes in both modules
- Validate \`:id\` and \`:patientId\` path params as valid MongoDB ObjectId strings

## Acceptance Criteria
- \`POST /encounters\` with missing \`chiefComplaint\` returns \`400\` with a Zod issues array
- \`POST /payments/intent\` with \`amount: -5\` returns \`400\`
- \`GET /encounters/not-a-valid-id\` returns \`400\`, not a Mongoose CastError 500"
