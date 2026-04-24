#!/usr/bin/env bash
set -e

# Issues 108–120

gh issue create \
  --title "patients.controller.ts uses patient.model.ts from wrong path — duplicate model files cause runtime errors" \
  --label "bug,Stellar Wave" \
  --body "## Problem
\`apps/api/src/modules/patients/patients.controller.ts\` imports from \`./patient.model\` (root of the patients folder), but the canonical model lives at \`./models/patient.model.ts\`. Both files exist simultaneously, creating two separate Mongoose model registrations for the same collection. On hot-reload or in test environments this throws \`OverwriteModelError: Cannot overwrite \`Patient\` model once compiled\`.

## Location
- \`apps/api/src/modules/patients/patient.model.ts\` (duplicate — should be deleted)
- \`apps/api/src/modules/patients/patients.controller.ts\` line 3

## Steps to Reproduce
1. Start the API server.
2. Make any request that triggers the patients module.
3. Observe \`OverwriteModelError\` in logs on second load.

## Expected Behaviour
One canonical model file at \`models/patient.model.ts\`; controller imports from there.

## Fix
- Delete \`apps/api/src/modules/patients/patient.model.ts\`.
- Update \`patients.controller.ts\` import to \`./models/patient.model\`.
- Verify no other file imports the duplicate path.

## Acceptance Criteria
- [ ] Only one \`patient.model.ts\` exists under \`models/\`
- [ ] \`patients.controller.ts\` imports from \`./models/patient.model\`
- [ ] API starts without \`OverwriteModelError\`"

gh issue create \
  --title "No \`GET /api/v1/patients\` list endpoint — cannot fetch all patients" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`patients.controller.ts\` only exposes \`POST /\`, \`GET /search\`, and \`GET /:id\`. There is no \`GET /\` list endpoint. The web app's \`patients/page.tsx\` calls \`GET /api/v1/patients\` and receives a 404, so the patients table is always empty.

## Location
- \`apps/api/src/modules/patients/patients.controller.ts\`
- \`apps/web/src/app/patients/page.tsx\`

## Expected Behaviour
\`GET /api/v1/patients?page=1&limit=20\` returns a paginated list of patients scoped to the authenticated clinic.

## Tasks
- [ ] Add \`GET /\` route to \`patients.controller.ts\` with \`clinicId\` filter, pagination (\`page\`, \`limit\` query params), and \`isActive\` filter
- [ ] Return \`{ status, data: Patient[], meta: { total, page, limit } }\`
- [ ] Protect with \`authenticate\` middleware
- [ ] Update web page to use correct field names (\`firstName\`, \`lastName\` not \`name\`)

## Acceptance Criteria
- [ ] \`GET /api/v1/patients\` returns paginated patient list
- [ ] Response scoped to caller's \`clinicId\`
- [ ] Web patients page renders real data"

gh issue create \
  --title "\`PaymentRecord\` model missing \`patientId\` and \`asset\` fields — payment records not linked to patients" \
  --label "bug,Stellar Wave" \
  --body "## Problem
\`apps/api/src/modules/payments/models/payment-record.model.ts\` has no \`patientId\` field and no \`asset\` field (e.g. XLM vs USDC). This means:
1. It is impossible to query payments for a specific patient.
2. All payments are assumed to be XLM — multi-asset support is blocked.
3. The payments list page cannot show which patient a payment belongs to.

## Location
\`apps/api/src/modules/payments/models/payment-record.model.ts\`

## Tasks
- [ ] Add \`patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true }\`
- [ ] Add \`asset: { type: String, default: 'XLM' }\` (e.g. \`'XLM'\`, \`'USDC'\`)
- [ ] Add \`txHash: { type: String }\` for confirmed transaction hash
- [ ] Add index on \`patientId\` and \`clinicId\`
- [ ] Update \`POST /payments/intent\` to accept and store \`patientId\` and \`asset\`

## Acceptance Criteria
- [ ] \`PaymentRecord\` schema includes \`patientId\`, \`asset\`, and \`txHash\`
- [ ] \`POST /payments/intent\` validates and stores \`patientId\`
- [ ] \`GET /payments?patientId=\` filters by patient"

gh issue create \
  --title "\`EncounterModel\` uses \`ObjectId\` for \`clinicId\` but \`PatientModel\` uses \`String\` — type mismatch breaks cross-collection queries" \
  --label "bug,Stellar Wave" \
  --body "## Problem
\`encounter.model.ts\` declares \`clinicId: Schema.Types.ObjectId\` while \`patient.model.ts\` declares \`clinicId: String\`. When the auth middleware sets \`req.user.clinicId\` as a string, queries against \`EncounterModel\` with that string value will never match because MongoDB compares \`ObjectId\` and \`String\` as different types.

## Location
- \`apps/api/src/modules/encounters/encounter.model.ts\` line 6
- \`apps/api/src/modules/patients/models/patient.model.ts\` line 9

## Fix
Standardise \`clinicId\` as \`String\` across all models (consistent with how JWT payload stores it), or cast to \`ObjectId\` consistently everywhere.

## Acceptance Criteria
- [ ] All models use the same type for \`clinicId\`
- [ ] Encounter queries by \`clinicId\` return correct results
- [ ] Unit test confirms cross-collection \`clinicId\` consistency"

gh issue create \
  --title "No \`POST /api/v1/auth/register\` endpoint — cannot create new users" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`auth.routes.ts\` only exposes \`POST /login\` and \`POST /refresh\`. There is no registration endpoint. The only way to create a user is via direct database insertion, making the system unusable for new clinics.

## Location
\`apps/api/src/modules/auth/auth.controller.ts\`

## Tasks
- [ ] Add \`POST /api/v1/auth/register\` accepting \`{ fullName, email, password, role, clinicId }\`
- [ ] Validate with Zod schema (password min 8 chars, valid role enum, valid email)
- [ ] Hash password via \`bcryptjs\` (already used in \`UserModel\` pre-save hook)
- [ ] Protect with \`authorize([Roles.SUPER_ADMIN, Roles.CLINIC_ADMIN])\` — only admins can create users
- [ ] Return \`201\` with sanitized user (no password field)

## Acceptance Criteria
- [ ] \`POST /auth/register\` creates a user and returns 201
- [ ] Password is never returned in response
- [ ] Non-admin callers receive 403
- [ ] Duplicate email returns 409"

gh issue create \
  --title "No \`POST /api/v1/auth/logout\` or refresh token revocation — tokens valid until expiry after logout" \
  --label "security,Stellar Wave" \
  --body "## Problem
There is no logout endpoint and no refresh token revocation mechanism. Once a refresh token is issued it remains valid for 7 days regardless of logout. An attacker who obtains a refresh token can continue generating access tokens indefinitely.

## Location
\`apps/api/src/modules/auth/auth.controller.ts\`
\`apps/api/src/modules/auth/token.service.ts\`

## Tasks
- [ ] Add a \`refreshTokenHash\` field to \`UserModel\` (hashed, not plaintext)
- [ ] On \`POST /login\`, store hash of issued refresh token on the user document
- [ ] Add \`POST /auth/logout\` that clears \`refreshTokenHash\` (requires valid access token)
- [ ] In \`POST /auth/refresh\`, verify the incoming token hash matches stored hash before issuing new access token
- [ ] On password change, invalidate all refresh tokens by clearing the hash

## Acceptance Criteria
- [ ] \`POST /auth/logout\` clears the stored refresh token hash
- [ ] Reusing a revoked refresh token returns 401
- [ ] Password change invalidates existing refresh tokens"

gh issue create \
  --title "No \`POST /api/v1/auth/forgot-password\` or \`reset-password\` endpoints — password recovery impossible" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`UserModel\` has \`resetPasswordTokenHash\` and \`resetPasswordExpiresAt\` fields defined but no routes use them. Users who forget their password have no recovery path.

## Location
- \`apps/api/src/modules/auth/models/user.model.ts\` (fields exist but unused)
- \`apps/api/src/modules/auth/auth.controller.ts\` (routes missing)

## Tasks
- [ ] Add \`POST /auth/forgot-password\` — accepts \`email\`, generates a secure random token, stores its hash + expiry (1 hour) on the user, sends reset email (integrate with email service from issue #34)
- [ ] Add \`POST /auth/reset-password\` — accepts \`token\` + \`newPassword\`, verifies hash and expiry, updates password, clears reset fields
- [ ] Token must be single-use (clear after successful reset)
- [ ] Respond with generic success message regardless of whether email exists (prevent user enumeration)

## Acceptance Criteria
- [ ] \`POST /auth/forgot-password\` stores hashed token and returns 200 with generic message
- [ ] \`POST /auth/reset-password\` with valid token updates password and clears token fields
- [ ] Expired or already-used tokens return 400
- [ ] User enumeration not possible via response differences"

gh issue create \
  --title "Stellar service \`/intent\` endpoint accepts raw \`fromSecret\` in request body — private key exposure" \
  --label "security,Stellar Wave" \
  --body "## Problem
\`apps/stellar-service/src/index.ts\` — the \`POST /intent\` endpoint requires the caller to send \`fromSecret\` (a Stellar private key) in the HTTP request body. This means:
1. The private key travels over the network in plaintext (even with TLS, it is logged by any middleware).
2. Any server-side log will capture the secret key.
3. The API server must never handle client private keys.

## Location
\`apps/stellar-service/src/index.ts\` lines 20–40

## Fix
The stellar service should use the clinic's server-side keypair (from \`config.stellarSecretKey\`) to sign transactions, not a caller-supplied secret. The endpoint should accept \`{ toPublic, amount, assetCode, memo }\` only.

## Acceptance Criteria
- [ ] \`fromSecret\` removed from \`POST /intent\` request body
- [ ] Transaction signed using \`config.stellarSecretKey\` loaded from environment
- [ ] No private key ever appears in request/response bodies or logs
- [ ] Endpoint returns 500 if \`STELLAR_SECRET_KEY\` env var is not set"

gh issue create \
  --title "No \`PATCH /api/v1/patients/:id\` endpoint — patient records cannot be updated" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
Issue #13 tracks missing update/delete endpoints broadly. This issue specifically covers the patient update flow. \`patients.controller.ts\` has no \`PATCH\` route, so correcting a patient's contact number, address, or name requires direct database access.

## Location
\`apps/api/src/modules/patients/patients.controller.ts\`

## Tasks
- [ ] Add \`PATCH /api/v1/patients/:id\` accepting partial patient fields
- [ ] Validate with Zod partial schema (all fields optional, at least one required)
- [ ] Scope update to caller's \`clinicId\` — cannot update patients from other clinics
- [ ] Recalculate \`searchName\` if \`firstName\` or \`lastName\` changes
- [ ] Protect with \`authorize([Roles.CLINIC_ADMIN, Roles.DOCTOR, Roles.NURSE])\`
- [ ] Return updated patient document

## Acceptance Criteria
- [ ] \`PATCH /patients/:id\` updates only provided fields
- [ ] \`searchName\` stays in sync with name changes
- [ ] Cross-clinic update attempt returns 404 (not 403, to avoid leaking existence)"

gh issue create \
  --title "No \`DELETE /api/v1/patients/:id\` (deactivation) endpoint — patients cannot be deactivated" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`PatientModel\` has an \`isActive\` boolean field but there is no endpoint to set it to \`false\`. Hard deletion of patient records is inappropriate in a medical context (audit trail required). Soft-delete via \`isActive = false\` is the correct pattern but is not implemented.

## Location
\`apps/api/src/modules/patients/patients.controller.ts\`

## Tasks
- [ ] Add \`DELETE /api/v1/patients/:id\` that sets \`isActive = false\` (soft delete)
- [ ] Protect with \`authorize([Roles.CLINIC_ADMIN])\` — only admins can deactivate
- [ ] Return \`204 No Content\` on success
- [ ] \`GET /patients\` list must filter \`isActive: true\` by default; add \`?includeInactive=true\` query param for admins
- [ ] Deactivated patients must not appear in search results by default

## Acceptance Criteria
- [ ] \`DELETE /patients/:id\` sets \`isActive = false\`, returns 204
- [ ] Deactivated patients excluded from default list and search
- [ ] Only \`CLINIC_ADMIN\` can deactivate; others receive 403"

gh issue create \
  --title "No \`PATCH /api/v1/encounters/:id\` or \`DELETE\` — encounter records immutable after creation" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
Once an encounter is created via \`POST /encounters\`, there is no way to correct errors (wrong diagnosis, typo in chief complaint) or add the AI summary after generation. The \`aiSummary\` field exists on the model but no endpoint writes to it post-creation.

## Location
\`apps/api/src/modules/encounters/encounters.controller.ts\`

## Tasks
- [ ] Add \`PATCH /api/v1/encounters/:id\` accepting \`{ chiefComplaint, notes, aiSummary, diagnosis, treatmentPlan }\` (all optional)
- [ ] Restrict to \`DOCTOR\` and \`CLINIC_ADMIN\` roles
- [ ] Add \`DELETE /api/v1/encounters/:id\` as soft-delete (\`isActive\` flag) for \`CLINIC_ADMIN\` only
- [ ] Scope all operations to caller's \`clinicId\`

## Acceptance Criteria
- [ ] \`PATCH /encounters/:id\` updates provided fields and returns updated document
- [ ] \`aiSummary\` can be written via PATCH after AI generation
- [ ] \`DELETE /encounters/:id\` soft-deletes; encounter excluded from list by default"

gh issue create \
  --title "Stellar service has no authentication — any caller can submit transactions on behalf of the clinic" \
  --label "security,Stellar Wave" \
  --body "## Problem
\`apps/stellar-service/src/index.ts\` exposes \`POST /fund\`, \`POST /intent\`, and \`GET /verify/:hash\` with zero authentication. Any process that can reach port 3002 (or whatever \`STELLAR_PORT\` is set to) can trigger real Stellar transactions using the clinic's keypair.

## Location
\`apps/stellar-service/src/index.ts\`

## Fix
- Add a shared secret (\`STELLAR_SERVICE_SECRET\`) checked via \`Authorization: Bearer <secret>\` header on all mutating endpoints
- The API server must include this header when calling the stellar service
- \`GET /verify/:hash\` can remain unauthenticated (read-only, public blockchain data)
- Document the secret in \`.env.example\`

## Acceptance Criteria
- [ ] \`POST /fund\` and \`POST /intent\` require valid \`Authorization\` header
- [ ] Missing or wrong secret returns 401
- [ ] \`STELLAR_SERVICE_SECRET\` added to \`.env.example\`
- [ ] API payments controller passes the secret when calling stellar service"

gh issue create \
  --title "No \`GET /api/v1/encounters\` list endpoint — encounters page always empty" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`encounters.controller.ts\` only has \`POST /\`, \`GET /:id\`, and \`GET /patient/:patientId\`. There is no \`GET /\` list endpoint. The web app's \`encounters/page.tsx\` calls \`GET /api/v1/encounters\` and receives a 404.

## Location
- \`apps/api/src/modules/encounters/encounters.controller.ts\`
- \`apps/web/src/app/encounters/page.tsx\`

## Tasks
- [ ] Add \`GET /\` route with pagination (\`page\`, \`limit\`), optional \`patientId\` filter, optional \`status\` filter, sorted by \`createdAt\` descending
- [ ] Populate \`patientId\` with \`firstName\`, \`lastName\`, \`systemId\` (lean select)
- [ ] Scope to caller's \`clinicId\`
- [ ] Return \`{ status, data: Encounter[], meta: { total, page, limit } }\`

## Acceptance Criteria
- [ ] \`GET /encounters\` returns paginated list
- [ ] Patient name fields populated in response
- [ ] Web encounters page renders real data"
