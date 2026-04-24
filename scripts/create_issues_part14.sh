#!/usr/bin/env bash
set -e

# Issues 147–157 (final batch to reach 50 total)

gh issue create \
  --title "No \`GET /api/v1/users\` or user management endpoints — admins cannot manage clinic staff" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
There is no user management API. \`CLINIC_ADMIN\` users have no way to list, deactivate, or update staff accounts through the API. The only user-related endpoints are \`/auth/login\` and \`/auth/refresh\`. A clinic admin needs to be able to:
1. List all users in their clinic
2. Deactivate a user who has left the clinic
3. Update a user's role

## Tasks
- [ ] Create \`apps/api/src/modules/users/\` module
- [ ] Add \`GET /api/v1/users\` — list users in caller's clinic (CLINIC_ADMIN only)
- [ ] Add \`GET /api/v1/users/:id\` — get single user
- [ ] Add \`PATCH /api/v1/users/:id\` — update \`fullName\`, \`role\` (CLINIC_ADMIN only)
- [ ] Add \`DELETE /api/v1/users/:id\` — soft-deactivate (\`isActive = false\`, CLINIC_ADMIN only)
- [ ] Register routes in \`app.ts\`

## Acceptance Criteria
- [ ] \`GET /users\` returns all active users in caller's clinic
- [ ] \`PATCH /users/:id\` cannot change \`email\` or \`password\` (use auth endpoints for that)
- [ ] \`DELETE /users/:id\` prevents the user from logging in"

gh issue create \
  --title "No \`GET /api/v1/dashboard/stats\` endpoint — dashboard page has no data to display" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
The web app's home page (\`apps/web/src/app/page.tsx\`) is a static stub with no data. A real EMR dashboard needs summary statistics: today's patient count, pending payments, open encounters, and active doctors. There is no API endpoint to provide this data.

## Tasks
- [ ] Create \`apps/api/src/modules/dashboard/dashboard.controller.ts\`
- [ ] Add \`GET /api/v1/dashboard/stats\` returning:
  - \`todayPatients\`: patients created today in the clinic
  - \`openEncounters\`: encounters with \`status: 'open'\`
  - \`pendingPayments\`: payment records with \`status: 'pending'\`
  - \`totalPatients\`: all active patients in the clinic
- [ ] Use \`Promise.all\` for parallel DB queries
- [ ] Protect with \`authenticate\` middleware
- [ ] Register route in \`app.ts\`

## Acceptance Criteria
- [ ] \`GET /dashboard/stats\` returns all 4 metrics in under 500ms
- [ ] Stats scoped to caller's \`clinicId\`
- [ ] Web home page updated to fetch and display stats"

gh issue create \
  --title "No \`GET /api/v1/patients/:id/encounters\` — cannot view a patient's encounter history from patient detail" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`encounters.controller.ts\` has \`GET /encounters/patient/:patientId\` but this route conflicts with \`GET /encounters/:id\` — Express will match \`/encounters/patient\` as an \`id\` parameter. The route ordering bug means the patient-scoped encounter list is unreachable.

Additionally, the RESTful convention for nested resources is \`/patients/:id/encounters\`, not a query on the encounters endpoint.

## Location
\`apps/api/src/modules/encounters/encounters.controller.ts\`

## Tasks
- [ ] Add \`GET /api/v1/patients/:id/encounters\` to \`patients.routes.ts\` (nested route)
- [ ] Fix route ordering in \`encounters.controller.ts\` so \`/patient/:patientId\` is registered before \`/:id\`
- [ ] Return paginated encounter list sorted by \`createdAt\` descending
- [ ] Verify patient belongs to caller's clinic before returning encounters

## Acceptance Criteria
- [ ] \`GET /patients/:id/encounters\` returns that patient's encounters
- [ ] \`GET /encounters/patient/:patientId\` no longer shadowed by \`/:id\` route
- [ ] Cross-clinic access returns 404"

gh issue create \
  --title "No \`GET /api/v1/patients/:id/payments\` — cannot view a patient's payment history from patient detail" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
There is no endpoint to retrieve all payments for a specific patient. The payments list endpoint (once implemented) will return all clinic payments, but the patient detail page needs to show only that patient's payment history. This requires a nested route.

## Tasks
- [ ] Add \`GET /api/v1/patients/:id/payments\` to \`patients.routes.ts\`
- [ ] Query \`PaymentRecordModel\` by \`patientId\` and \`clinicId\`
- [ ] Return paginated results sorted by \`createdAt\` descending
- [ ] Verify patient belongs to caller's clinic

## Acceptance Criteria
- [ ] \`GET /patients/:id/payments\` returns that patient's payment records
- [ ] Response includes \`status\`, \`amount\`, \`asset\`, \`txHash\`, \`createdAt\`
- [ ] Cross-clinic access returns 404"

gh issue create \
  --title "No \`POST /api/v1/ai/summarize\` implementation — AI endpoint returns 501 forever" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`apps/api/src/modules/ai/ai.routes.ts\` returns \`501 Not Implemented\` for \`POST /ai/summarize\`. \`config.geminiApiKey\` is defined in the config package, indicating Gemini was the intended AI provider. The encounter model has an \`aiSummary\` field waiting to be populated.

## Tasks
- [ ] Install \`@google/generative-ai\` in \`apps/api\`
- [ ] Implement \`POST /ai/summarize\` accepting \`{ encounterId }\`
- [ ] Fetch encounter from DB, build a clinical prompt from \`chiefComplaint\`, \`notes\`, \`diagnosis\`, \`vitalSigns\`
- [ ] Call Gemini API (\`gemini-1.5-flash\` model) with the prompt
- [ ] Store the summary in \`encounter.aiSummary\` and return it
- [ ] Return 503 with \`{ error: 'AIUnavailable' }\` if Gemini API key not configured
- [ ] Protect with \`authenticate\` middleware

## Acceptance Criteria
- [ ] \`POST /ai/summarize\` with valid \`encounterId\` returns AI-generated summary
- [ ] Summary stored on encounter document
- [ ] Missing API key returns 503, not 501
- [ ] Prompt does not include PII beyond what is clinically necessary"

gh issue create \
  --title "No \`X-Request-ID\` header — distributed tracing impossible across API and stellar service" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
Issue #36 tracks missing request correlation IDs. This issue covers the implementation. When the API calls the stellar service to verify a transaction, there is no shared request ID to correlate logs across both services. Debugging a failed payment requires manually matching timestamps across two log streams.

## Location
\`apps/api/src/app.ts\`
\`apps/stellar-service/src/index.ts\`

## Tasks
- [ ] Add middleware to \`app.ts\` that reads \`X-Request-ID\` header or generates a UUID if absent
- [ ] Attach \`requestId\` to \`req\` object (extend Express \`Request\` type)
- [ ] Include \`requestId\` in all log output
- [ ] Forward \`X-Request-ID\` header when API calls stellar service
- [ ] Return \`X-Request-ID\` in all API responses

## Acceptance Criteria
- [ ] Every API response includes \`X-Request-ID\` header
- [ ] Stellar service logs include the forwarded request ID
- [ ] Same request ID appears in both API and stellar service logs for payment operations"

gh issue create \
  --title "No \`PATCH /api/v1/users/me/password\` — authenticated users cannot change their own password" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
There is no endpoint for an authenticated user to change their own password. The only password change mechanism is the forgot-password flow (issue #114), which requires email access. A logged-in user who wants to proactively change their password has no way to do so.

## Tasks
- [ ] Add \`PATCH /api/v1/users/me/password\` accepting \`{ currentPassword, newPassword, confirmPassword }\`
- [ ] Verify \`currentPassword\` matches stored hash using \`bcrypt.compare\`
- [ ] Validate \`newPassword\` meets complexity requirements (min 8 chars, at least one number)
- [ ] Verify \`newPassword === confirmPassword\`
- [ ] Hash and store new password
- [ ] Invalidate all refresh tokens (clear \`refreshTokenHash\`)
- [ ] Protect with \`authenticate\` middleware

## Acceptance Criteria
- [ ] Wrong \`currentPassword\` returns 401
- [ ] \`newPassword\` not meeting complexity returns 400 with specific message
- [ ] Successful change invalidates existing refresh tokens
- [ ] Response does not include password hash"

gh issue create \
  --title "No \`GET /api/v1/users/me\` endpoint — frontend cannot fetch current user profile" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
After login, the web app receives an access token but has no way to fetch the current user's profile (full name, role, clinic name). The JWT payload contains \`userId\`, \`role\`, and \`clinicId\` but not display information. Without a \`/me\` endpoint, the UI cannot show the logged-in user's name or role in the navigation bar.

## Tasks
- [ ] Add \`GET /api/v1/users/me\` protected by \`authenticate\`
- [ ] Return \`{ userId, fullName, email, role, clinicId, clinicName }\` (no password)
- [ ] Populate \`clinicName\` from the Clinic model (once issue #121 is resolved)
- [ ] Cache response for 60 seconds (ETag or Cache-Control)

## Acceptance Criteria
- [ ] \`GET /users/me\` returns current user's profile
- [ ] Password field never included in response
- [ ] Deactivated user's token returns 401"

gh issue create \
  --title "No \`Prescription\` sub-document on encounters — medication orders not tracked" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
The \`EncounterModel\` has no prescriptions field. In a clinical EMR, every encounter may result in medication prescriptions. Without this data, the system cannot support medication history, drug interaction checking, or pharmacy integration.

## Location
\`apps/api/src/modules/encounters/encounter.model.ts\`

## Tasks
- [ ] Add \`prescriptions\` array sub-document to \`EncounterModel\`:
  \`\`\`
  { medicationName: String, dosage: String, frequency: String, duration: String, notes: String }
  \`\`\`
- [ ] Add \`POST /api/v1/encounters/:id/prescriptions\` to add a prescription
- [ ] Add \`DELETE /api/v1/encounters/:id/prescriptions/:prescriptionId\` to remove one
- [ ] Include prescriptions in \`GET /encounters/:id\` response
- [ ] Restrict prescription management to \`DOCTOR\` and \`CLINIC_ADMIN\` roles

## Acceptance Criteria
- [ ] Encounter detail response includes \`prescriptions\` array
- [ ] \`POST /encounters/:id/prescriptions\` adds prescription and returns updated encounter
- [ ] \`NURSE\` role cannot add or delete prescriptions (403)"

gh issue create \
  --title "No \`Webhook\` support for Stellar payment events — payment status updates require polling" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
Currently the only way to check if a Stellar payment has been confirmed is to poll \`GET /payments/status/:intentId\`. In production, the clinic's Stellar account will receive payments from patients. There is no mechanism to automatically detect incoming transactions and update payment records without manual confirmation.

## Tasks
- [ ] Add \`POST /api/v1/webhooks/stellar\` endpoint to receive Stellar Horizon event stream notifications
- [ ] Implement Stellar account stream listener in the stellar service using \`horizon.payments().forAccount(publicKey).stream()\`
- [ ] On incoming payment: match by \`memo\` to a pending \`PaymentRecord\`, update status to \`confirmed\`, store \`txHash\`
- [ ] Emit a server-sent event or WebSocket message to connected clients (relates to issue #30)
- [ ] Add \`STELLAR_PLATFORM_PUBLIC_KEY\` to config for the account to monitor

## Acceptance Criteria
- [ ] Stellar service streams payments for the clinic's public key
- [ ] Matching pending payment record updated to \`confirmed\` automatically
- [ ] Non-matching payments logged and ignored (not errored)"

gh issue create \
  --title "No \`audit log\` collection — no record of who accessed or modified patient data" \
  --label "security,Stellar Wave" \
  --body "## Problem
Issue #77 tracks HIPAA audit logging. This issue covers the implementation. HIPAA requires that every access to Protected Health Information (PHI) be logged with: who accessed it, what they accessed, when, and from where. There is currently no audit trail in the system.

## Tasks
- [ ] Create \`AuditLogModel\` with fields: \`userId\`, \`clinicId\`, \`action\` (enum: READ, CREATE, UPDATE, DELETE), \`resourceType\` (Patient, Encounter, Payment), \`resourceId\`, \`ipAddress\`, \`userAgent\`, \`timestamp\`
- [ ] Create \`auditLog\` middleware that logs after successful responses on patient/encounter routes
- [ ] Apply middleware to all \`/patients\` and \`/encounters\` routes
- [ ] Add \`GET /api/v1/audit-logs\` for CLINIC_ADMIN and SUPER_ADMIN only
- [ ] Audit logs must be append-only (no update or delete endpoints)

## Acceptance Criteria
- [ ] Every \`GET /patients/:id\` creates an audit log entry
- [ ] Every \`POST\`, \`PATCH\`, \`DELETE\` on patients/encounters creates an audit log entry
- [ ] \`GET /audit-logs\` returns paginated logs filtered by \`clinicId\`
- [ ] Audit log entries cannot be deleted via API"

gh issue create \
  --title "No \`health check\` for MongoDB and Stellar service — \`GET /health\` always returns \`ok\` even when dependencies are down" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`GET /health\` in \`app.ts\` always returns \`{ status: 'ok' }\` regardless of whether MongoDB is connected or the stellar service is reachable. Load balancers and orchestration systems (Kubernetes, ECS) use health checks to route traffic. A false-positive health check means traffic is routed to a broken instance.

## Location
\`apps/api/src/app.ts\` line 12

## Tasks
- [ ] Enhance \`GET /health\` to check:
  - MongoDB: \`mongoose.connection.readyState === 1\`
  - Stellar service: \`GET http://stellar-service:3002/health\` (add a health endpoint to stellar service)
- [ ] Return \`200\` only if all dependencies healthy; return \`503\` if any are down
- [ ] Response body: \`{ status: 'ok'|'degraded', checks: { mongo: 'ok'|'error', stellar: 'ok'|'error' } }\`
- [ ] Add \`GET /health\` to stellar service

## Acceptance Criteria
- [ ] \`GET /health\` returns 503 when MongoDB is disconnected
- [ ] \`GET /health\` returns 503 when stellar service is unreachable
- [ ] Response body includes per-dependency status
- [ ] Health check completes in under 2 seconds (timeout on dependency checks)"
