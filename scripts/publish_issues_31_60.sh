#!/usr/bin/env bash
set -e
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add French translation completeness check to CI pipeline" \
  --label "i18n,ci-cd,enhancement" \
  --body "## Description

The project supports English and French internationalization via \`apps/web/messages/en.json\` and \`apps/web/messages/fr.json\`. However, there is no automated check in the CI pipeline to verify that all keys present in \`en.json\` also exist in \`fr.json\`. Missing translation keys cause the \`next-intl\` library to fall back to the key name (e.g., \`'patients.title'\`) being displayed to French-speaking users instead of translated text.

**Why it matters in production:** Health Watchers serves French-speaking healthcare providers. Missing translations degrade the user experience and may cause confusion in clinical settings where precise language is critical.

## Tasks

- [ ] Create a script \`scripts/check-translations.ts\` that compares keys between \`en.json\` and \`fr.json\`
- [ ] The script should report missing keys, extra keys, and empty string values
- [ ] Add the translation check as a step in the CI \`quality-checks\` job
- [ ] Fix all currently missing French translations in \`fr.json\`
- [ ] Add a pre-commit hook that runs the translation check
- [ ] Add support for nested key comparison (the JSON files use nested objects)
- [ ] Generate a translation coverage report as a CI artifact

## Acceptance Criteria

- CI fails if any key in \`en.json\` is missing from \`fr.json\`
- CI fails if any French translation value is an empty string
- All current missing translations are fixed
- Pre-commit hook prevents committing with missing translations
- Translation coverage report is generated in CI"

gh issue create --repo "$REPO" \
  --title "Bug: Payment expiration job does not handle MongoDB connection errors gracefully" \
  --label "bug,reliability,payments" \
  --body "## Description

In \`apps/api/src/modules/payments/services/payment-expiration-job.ts\`, the scheduled job that expires pending payments runs on a timer. If MongoDB is temporarily unavailable (e.g., during a rolling restart), the job will throw an unhandled error. The \`startServer\` function in \`app.ts\` registers an \`unhandledRejection\` handler that logs but does not exit, so the job may silently fail and leave expired payments in \`pending\` status indefinitely.

**Why it matters in production:** Payments stuck in \`pending\` status after expiration can cause accounting discrepancies and prevent patients from making new payments for the same encounter.

## Tasks

- [ ] Add try/catch error handling inside the payment expiration job's tick function
- [ ] Log errors with structured context (job name, error details) using the pino logger
- [ ] Add a Prometheus counter for job execution failures: \`payment_expiration_job_errors_total\`
- [ ] Add a Prometheus gauge for the number of payments expired per run
- [ ] Implement exponential backoff retry for transient MongoDB errors
- [ ] Add a health check endpoint that reports the last successful job run time
- [ ] Write unit tests for the job's error handling
- [ ] Add a Prometheus alert if the job hasn't run successfully in 2x its interval

## Acceptance Criteria

- MongoDB errors in the expiration job are caught and logged, not thrown
- The job continues running after a transient error
- Prometheus metrics track job success/failure
- Alert fires if the job fails for more than 2 consecutive runs
- Unit tests cover error scenarios"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add input sanitization for SOAP notes rich text fields to prevent XSS" \
  --label "security,enhancement,clinical" \
  --body "## Description

The \`EncounterModel\` in \`apps/api/src/modules/encounters/encounter.model.ts\` defines SOAP notes fields (\`subjective\`, \`objective\`, \`assessment\`, \`plan\`) as rich HTML content. The \`sanitizeHtml\` utility from \`apps/api/src/utils/sanitize.ts\` is imported in the encounter model but it's not clear if it's applied to all SOAP note fields before storage.

If SOAP notes accept arbitrary HTML and are rendered in the frontend without sanitization, a malicious user could inject JavaScript that executes in other clinicians' browsers (stored XSS). In a healthcare context, this could be used to steal session tokens and access patient records.

**Why it matters in production:** Stored XSS in clinical notes is a high-severity vulnerability. A compromised clinician session could expose all patients in the clinic.

## Tasks

- [ ] Audit \`encounter.model.ts\` to confirm \`sanitizeHtml\` is applied to all SOAP note fields
- [ ] Add a \`pre('save')\` hook that sanitizes all SOAP note fields using \`sanitizeHtml\`
- [ ] Add a \`pre('findOneAndUpdate')\` hook for the same sanitization
- [ ] Configure \`sanitizeHtml\` with a strict allowlist: only \`<p>\`, \`<br>\`, \`<strong>\`, \`<em>\`, \`<ul>\`, \`<ol>\`, \`<li>\` tags
- [ ] Strip all \`on*\` event attributes and \`javascript:\` URLs
- [ ] Add unit tests for the sanitization with XSS payloads
- [ ] Add a Content Security Policy header that prevents inline script execution
- [ ] Update the frontend rich text editor to use the same allowlist

## Acceptance Criteria

- SOAP note fields stored in MongoDB contain no \`<script>\` tags or \`on*\` attributes
- XSS payloads in SOAP notes are sanitized before storage
- The frontend renders SOAP notes safely
- Unit tests cover common XSS vectors (script injection, event handlers, javascript: URLs)
- CSP header is set on all API responses"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar transaction idempotency key to prevent duplicate payments" \
  --label "enhancement,blockchain,reliability" \
  --body "## Description

In \`apps/api/src/modules/payments/payments.controller.ts\`, payment intents are created with a \`randomUUID()\` as the \`intentId\`. However, if a client retries a payment intent creation request (e.g., due to a network timeout), a second payment intent is created for the same encounter. This can result in duplicate payments being processed on the Stellar blockchain.

The \`PaymentRecordModel\` has a unique index on \`intentId\`, but since each retry generates a new UUID, the uniqueness constraint doesn't prevent duplicates.

**Why it matters in production:** Duplicate payments in a healthcare context result in patients being charged twice for the same service. This is a serious financial and trust issue.

## Tasks

- [ ] Add an \`idempotencyKey\` field to the payment intent creation request schema
- [ ] Store the \`idempotencyKey\` in \`PaymentRecordModel\` with a unique index
- [ ] Return the existing payment intent if the same \`idempotencyKey\` is submitted again
- [ ] Set the idempotency key TTL to 24 hours (use Redis or a TTL index)
- [ ] Update the frontend to generate and store idempotency keys per payment attempt
- [ ] Add the \`idempotencyKey\` to the Swagger documentation
- [ ] Write tests for idempotent payment intent creation
- [ ] Add a Prometheus counter for idempotency key hits

## Acceptance Criteria

- Submitting the same \`idempotencyKey\` twice returns the existing payment intent (not a new one)
- Idempotency keys expire after 24 hours
- The frontend generates a stable idempotency key per payment attempt
- Tests verify idempotent behavior
- Prometheus tracks idempotency key usage"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add automated backup verification — restore test for MongoDB backups" \
  --label "enhancement,reliability,devops" \
  --body "## Description

The \`scripts/backup-mongodb.sh\` script creates MongoDB backups and uploads them to S3. The \`.github/workflows/backup.yml\` workflow runs this script on a schedule. However, there is no automated verification that the backups are restorable. A backup that cannot be restored is worthless.

The \`docs/disaster-recovery.md\` documents the recovery procedure but it is entirely manual. In a HIPAA environment, backup integrity must be regularly tested.

**Why it matters in production:** Discovering that backups are corrupted or incomplete during an actual disaster recovery scenario is catastrophic. Regular restore tests are a HIPAA best practice.

## Tasks

- [ ] Add a \`scripts/verify-backup.sh\` script that downloads the latest backup and restores it to a temporary MongoDB instance
- [ ] Run a set of validation queries against the restored database to verify data integrity
- [ ] Add a weekly GitHub Actions workflow \`backup-verify.yml\` that runs the verification
- [ ] Send a Slack/email notification if backup verification fails
- [ ] Add a Prometheus metric \`backup_last_verified_timestamp\` 
- [ ] Add a Prometheus alert if backup verification hasn't run in 8 days
- [ ] Document the backup verification process in \`docs/disaster-recovery.md\`
- [ ] Test the restore procedure against a production-sized dataset

## Acceptance Criteria

- Backup verification runs weekly in CI
- Verification confirms the backup can be restored and queried
- Alert fires if verification fails or hasn't run in 8 days
- \`docs/disaster-recovery.md\` includes the verification procedure
- Prometheus metric tracks last successful verification"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient portal two-factor authentication" \
  --label "security,enhancement,portal" \
  --body "## Description

The patient portal (\`apps/api/src/modules/portal/portal.controller.ts\`) allows patients to log in and view their own health records. The portal uses a separate \`portalAccessToken\` cookie (as seen in \`apps/web/src/middleware.ts\`). However, the portal login does not support two-factor authentication.

Patients accessing their own health records via the portal should have the option (and ideally the requirement) to use MFA, especially since portal accounts may be accessed from personal devices that are less secure than clinical workstations.

**Why it matters in production:** Patient portal accounts contain sensitive PHI. Without MFA, a compromised patient password gives an attacker full access to the patient's health records, which is a HIPAA breach.

## Tasks

- [ ] Add TOTP-based MFA support to the portal login flow
- [ ] Add SMS-based OTP as an alternative MFA method for patients
- [ ] Add \`mfaEnabled\`, \`mfaSecret\` fields to the patient portal user model
- [ ] Create \`POST /api/v1/portal/auth/mfa/setup\` and \`POST /api/v1/portal/auth/mfa/verify\` endpoints
- [ ] Add a portal MFA setup page in the frontend
- [ ] Send an email notification when portal MFA is enabled or disabled
- [ ] Write tests for the portal MFA flow
- [ ] Update \`SECURITY.md\` to document portal MFA

## Acceptance Criteria

- Patients can enable TOTP MFA for their portal account
- Portal login requires MFA when enabled
- SMS OTP is available as a fallback
- Email notification is sent on MFA changes
- Tests cover the full portal MFA flow"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add API key scoping — restrict API keys to specific endpoints and HTTP methods" \
  --label "security,enhancement,api" \
  --body "## Description

The \`apps/api/src/modules/api-keys/api-keys.controller.ts\` and \`api-key.model.ts\` implement API key authentication. However, API keys appear to have no scope restrictions — a single API key grants access to all endpoints that the key owner's role can access.

In a healthcare integration context, third-party systems (e.g., lab systems, billing software) should only have access to the specific endpoints they need. An overly permissive API key is a significant security risk.

**Why it matters in production:** If a third-party integration's API key is compromised, the attacker gains access to all endpoints the key owner can access, potentially including patient records, payments, and admin functions.

## Tasks

- [ ] Add a \`scopes\` field to \`api-key.model.ts\` (array of allowed endpoint patterns)
- [ ] Update the API key middleware in \`api-key.middleware.ts\` to check scopes against the requested endpoint
- [ ] Add scope validation to the API key creation endpoint
- [ ] Define a set of predefined scopes: \`patients:read\`, \`patients:write\`, \`encounters:read\`, \`payments:read\`, etc.
- [ ] Update the API key management UI to show and configure scopes
- [ ] Add scope information to the API key usage logs in \`api-key-usage.model.ts\`
- [ ] Write tests for scope enforcement
- [ ] Document available scopes in the API documentation

## Acceptance Criteria

- API keys can be created with specific scopes
- Requests using a scoped API key to an out-of-scope endpoint return 403
- Scope validation is logged in the API key usage model
- Tests verify scope enforcement for each predefined scope
- API documentation lists all available scopes"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add lab result critical value alerting via Socket.IO and email" \
  --label "enhancement,clinical,realtime" \
  --body "## Description

The \`apps/api/src/modules/lab-results/lab-results.controller.ts\` handles lab result creation and retrieval. However, there is no mechanism to alert clinicians when a lab result contains a critical value (e.g., dangerously high potassium, critically low hemoglobin). Critical lab values require immediate clinical action and should trigger real-time alerts.

The \`lab-result.model.ts\` has a \`status\` field but no \`isCritical\` flag or reference range comparison.

**Why it matters in production:** Missing a critical lab value alert can result in patient harm. This is a patient safety issue, not just a feature request.

## Tasks

- [ ] Add \`isCritical\`, \`criticalReason\`, and \`referenceRange\` fields to \`lab-result.model.ts\`
- [ ] Add a critical value detection service that compares results against reference ranges
- [ ] Emit a \`lab:critical\` Socket.IO event to the attending doctor's user room when a critical value is detected
- [ ] Send an email alert to the attending doctor for critical lab values
- [ ] Create a \`CRITICAL_LAB_RESULT\` audit action in \`audit.model.ts\`
- [ ] Add a \`GET /api/v1/lab-results/critical\` endpoint for pending critical value acknowledgments
- [ ] Require explicit acknowledgment of critical values before they can be dismissed
- [ ] Write tests for critical value detection and alerting

## Acceptance Criteria

- Critical lab values trigger real-time Socket.IO notifications
- Email alerts are sent for critical values
- Critical values require explicit acknowledgment
- Audit log records critical value alerts and acknowledgments
- Tests cover critical value detection and notification flow"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Helm chart linting and validation to CI pipeline" \
  --label "ci-cd,infrastructure,enhancement" \
  --body "## Description

The project includes a Helm chart in \`helm/health-watchers/\` for Kubernetes deployment. However, the CI pipeline (\`.github/workflows/ci.yml\`) does not include any Helm chart linting or validation steps. Helm chart errors (invalid YAML, missing required values, template rendering failures) are only discovered when deploying to a cluster.

The \`helm/health-watchers/values.yaml\`, \`values-staging.yaml\`, and \`values-production.yaml\` files define environment-specific configurations that should be validated against the chart templates.

**Why it matters in production:** A broken Helm chart discovered during a production deployment causes downtime. Catching chart errors in CI prevents deployment failures.

## Tasks

- [ ] Add a \`helm-validate\` job to \`ci.yml\` that runs \`helm lint helm/health-watchers/\`
- [ ] Add \`helm template\` rendering validation for all values files (default, staging, production)
- [ ] Add \`helm unittest\` for chart template unit tests
- [ ] Add \`kubeval\` or \`kubeconform\` to validate the rendered Kubernetes manifests
- [ ] Validate the raw \`k8s/\` manifests with \`kubeconform\`
- [ ] Add a \`helm-docs\` step to auto-generate chart documentation
- [ ] Fix any existing Helm lint warnings in the chart templates
- [ ] Add the Helm validation job as a required check for PRs

## Acceptance Criteria

- \`helm lint\` passes with zero warnings on all values files
- \`helm template\` renders successfully for staging and production values
- \`kubeconform\` validates all rendered manifests
- CI fails if Helm lint or template rendering fails
- Chart documentation is auto-generated"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient appointment reminder notifications (email + in-app)" \
  --label "enhancement,clinical,notifications" \
  --body "## Description

The \`apps/api/src/modules/appointments/appointments.controller.ts\` manages appointment scheduling. The \`UserModel\` has a \`preferences.notificationTypes.appointment_reminder\` field, indicating that appointment reminders are planned but not yet implemented. The \`NotificationModel\` and \`notification.service.ts\` exist but are not connected to the appointment scheduling flow.

Patients and clinicians should receive reminders 24 hours and 1 hour before scheduled appointments.

**Why it matters in production:** Missed appointments are a significant problem in healthcare. Automated reminders reduce no-show rates and improve clinic efficiency.

## Tasks

- [ ] Create an \`appointment-reminder-job.ts\` that runs every 15 minutes
- [ ] Query appointments scheduled in the next 24 hours and 1 hour that haven't had reminders sent
- [ ] Send email reminders to patients and attending doctors
- [ ] Create in-app notifications via \`NotificationModel\`
- [ ] Emit \`appointment:reminder\` Socket.IO events to the relevant user rooms
- [ ] Add \`reminderSent24h\` and \`reminderSent1h\` boolean fields to \`appointment.model.ts\`
- [ ] Respect user notification preferences (\`preferences.notificationTypes.appointment_reminder\`)
- [ ] Write tests for the reminder job
- [ ] Add the job to \`startServer\` in \`app.ts\`

## Acceptance Criteria

- Reminders are sent 24 hours and 1 hour before appointments
- Email and in-app notifications are sent
- Users who have disabled appointment reminders do not receive them
- Reminders are not sent twice (idempotent)
- Tests cover the reminder job logic"

echo "Issues 31-40 created successfully"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add TypeScript strict mode to all packages and apps" \
  --label "enhancement,typescript,code-quality" \
  --body "## Description

The \`tsconfig.base.json\` at the root of the monorepo does not enable TypeScript strict mode (\`\"strict\": true\`). Individual app tsconfigs (\`apps/api/tsconfig.json\`, \`apps/web/tsconfig.json\`) may have partial strict settings but not the full strict suite. Without strict mode, TypeScript allows implicit \`any\`, non-null assertions without checks, and other patterns that can lead to runtime errors.

In a healthcare application handling PHI, type safety is critical to prevent data handling bugs.

**Why it matters in production:** TypeScript without strict mode provides a false sense of type safety. Implicit \`any\` types can allow PHI to be passed to logging functions or external APIs without type checking.

## Tasks

- [ ] Enable \`\"strict\": true\` in \`tsconfig.base.json\`
- [ ] Fix all TypeScript errors that arise from enabling strict mode in \`apps/api\`
- [ ] Fix all TypeScript errors in \`apps/web\`
- [ ] Fix all TypeScript errors in \`apps/stellar-service\`
- [ ] Fix all TypeScript errors in \`packages/\`
- [ ] Add \`\"noUncheckedIndexedAccess\": true\` for additional array safety
- [ ] Add \`\"exactOptionalPropertyTypes\": true\`
- [ ] Update the CI typecheck step to fail on any TypeScript errors
- [ ] Document the TypeScript configuration in \`CONTRIBUTING.md\`

## Acceptance Criteria

- \`tsconfig.base.json\` has \`\"strict\": true\`
- \`npm run typecheck\` passes with zero errors across all packages
- No \`// @ts-ignore\` or \`// @ts-expect-error\` comments without explanation
- CI typecheck job passes
- \`CONTRIBUTING.md\` documents TypeScript requirements"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar account balance low-water mark alerting" \
  --label "enhancement,blockchain,monitoring" \
  --body "## Description

The \`apps/api/src/modules/payments/services/balance-monitoring-job.ts\` monitors Stellar account balances. The \`UserModel\` has notification preferences for \`balance_low_warning\` and \`balance_critical\`. However, it's not clear if the balance monitoring job actually sends these notifications or just logs them.

Clinics need to maintain a minimum XLM balance to pay Stellar transaction fees. If the balance drops below the minimum reserve (currently 1 XLM base reserve + 0.5 XLM per entry), transactions will fail.

**Why it matters in production:** A clinic with insufficient XLM balance cannot process payments. This directly impacts revenue collection and patient billing.

## Tasks

- [ ] Audit \`balance-monitoring-job.ts\` to confirm notification sending is implemented
- [ ] Define configurable thresholds: \`BALANCE_LOW_THRESHOLD\` (e.g., 10 XLM) and \`BALANCE_CRITICAL_THRESHOLD\` (e.g., 2 XLM)
- [ ] Send email notifications to CLINIC_ADMIN users when balance crosses thresholds
- [ ] Create in-app notifications via \`NotificationModel\`
- [ ] Emit \`balance:low_warning\` and \`balance:critical\` Socket.IO events
- [ ] Add a Prometheus gauge for each clinic's XLM balance
- [ ] Add a Prometheus alert rule for critical balance
- [ ] Write tests for the threshold detection logic

## Acceptance Criteria

- Email and in-app notifications are sent when balance crosses thresholds
- Notifications respect user preferences (\`balance_low_warning\`, \`balance_critical\`)
- Prometheus gauge tracks clinic balances
- Alert fires when any clinic balance is critical
- Tests cover threshold detection and notification sending"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient CSV import validation and error reporting" \
  --label "enhancement,data-import,clinical" \
  --body "## Description

The \`apps/api/src/middlewares/csv-upload.middleware.ts\` handles CSV file uploads for patient import. The \`patients.controller.ts\` has a \`/import\` endpoint. However, the import process likely lacks comprehensive validation and error reporting. When importing 1,000 patients, if row 500 has an invalid date of birth, the entire import may fail without telling the user which rows had errors.

**Why it matters in production:** Bulk patient imports are used during clinic onboarding. A poor import experience (no error details, all-or-nothing behavior) forces manual data entry for large datasets.

## Tasks

- [ ] Implement row-by-row validation with detailed error collection
- [ ] Return a structured error report: \`{ imported: N, failed: M, errors: [{ row: N, field: 'dateOfBirth', message: '...' }] }\`
- [ ] Support partial imports (import valid rows, skip invalid rows with errors)
- [ ] Add a dry-run mode (\`?dryRun=true\`) that validates without importing
- [ ] Validate required fields, date formats, phone number formats, and duplicate detection
- [ ] Store import results in \`ImportLogModel\` for audit purposes
- [ ] Add a \`GET /api/v1/patients/import/:importId/status\` endpoint
- [ ] Write tests for various CSV validation scenarios

## Acceptance Criteria

- Import returns detailed per-row error information
- Valid rows are imported even when some rows have errors
- Dry-run mode validates without importing
- Import results are stored in the audit log
- Tests cover missing fields, invalid formats, and duplicate detection"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add OpenTelemetry distributed tracing to stellar-service" \
  --label "enhancement,observability,blockchain" \
  --body "## Description

The API has OpenTelemetry tracing configured in \`apps/api/src/tracing.ts\`. The stellar-service has a \`apps/stellar-service/src/tracing.ts\` file but it may not be fully configured or integrated with the API's trace context. When a payment request flows from the API to the stellar-service, the trace context should be propagated so that the entire payment flow appears as a single distributed trace.

**Why it matters in production:** Payment failures are complex to debug because they span multiple services. Without distributed tracing, it's impossible to see the full request flow in a single trace.

## Tasks

- [ ] Verify \`apps/stellar-service/src/tracing.ts\` is properly initialized before other imports
- [ ] Add W3C TraceContext header propagation to the stellar-service HTTP client
- [ ] Instrument key stellar-service functions with OpenTelemetry spans: \`fundAccount\`, \`getAccountBalance\`, \`sendPayment\`
- [ ] Configure the stellar-service to export traces to the same collector as the API
- [ ] Add trace context to stellar-service log output
- [ ] Update \`docker-compose.yml\` to include a Jaeger or Tempo collector
- [ ] Add a Grafana dashboard for distributed traces
- [ ] Write tests that verify trace context propagation

## Acceptance Criteria

- Payment requests show as a single distributed trace spanning API and stellar-service
- Stellar SDK operations appear as child spans
- Traces are exported to the configured collector
- Grafana dashboard shows payment trace data
- Tests verify trace context propagation"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add consent management versioning — track when patients accept updated consent forms" \
  --label "enhancement,compliance,hipaa" \
  --body "## Description

The \`apps/api/src/modules/consent/consent.model.ts\` and \`consent.controller.ts\` implement patient consent management. However, when a clinic updates its consent form (e.g., adds new data sharing provisions), there is no mechanism to track which version of the consent form each patient has accepted, or to prompt patients to re-consent when the form changes.

HIPAA requires that patients be informed of material changes to privacy practices and given the opportunity to consent.

**Why it matters in production:** Without consent versioning, a clinic cannot demonstrate that patients consented to the current version of their privacy practices. This is a HIPAA compliance gap.

## Tasks

- [ ] Add a \`ConsentFormModel\` with \`version\`, \`content\`, \`effectiveDate\`, and \`clinicId\` fields
- [ ] Add a \`version\` field to the existing \`ConsentModel\` linking to the consent form version
- [ ] Add a \`GET /api/v1/consent/current-version\` endpoint
- [ ] Add a \`POST /api/v1/consent/re-consent\` endpoint for patients to accept new versions
- [ ] Add a job that identifies patients who haven't consented to the current version
- [ ] Send email notifications to patients when a new consent version requires their acceptance
- [ ] Add consent version tracking to the audit log
- [ ] Write tests for consent versioning

## Acceptance Criteria

- Each consent record links to a specific consent form version
- Patients are notified when a new consent version requires acceptance
- \`GET /api/v1/consent/current-version\` returns the active consent form
- Audit log records consent version acceptance
- Tests cover version creation, patient notification, and re-consent flow"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Kubernetes liveness and readiness probe improvements" \
  --label "enhancement,infrastructure,reliability" \
  --body "## Description

The \`k8s/api/deployment.yaml\` configures liveness and readiness probes pointing to the health endpoint. However, the health controller in \`apps/api/src/modules/health/health.controller.ts\` may not perform deep health checks (e.g., verifying MongoDB connectivity, Redis connectivity, and stellar-service reachability) for the readiness probe.

A pod that is running but cannot connect to MongoDB should be marked as not ready and removed from the load balancer rotation. Currently, if MongoDB is down, the pod may still pass the liveness probe and receive traffic that will fail.

**Why it matters in production:** Kubernetes readiness probes are the primary mechanism for ensuring traffic is only routed to healthy pods. Shallow health checks can cause requests to be routed to pods that cannot serve them.

## Tasks

- [ ] Update \`health.controller.ts\` to implement separate \`/health/live\` (liveness) and \`/health/ready\` (readiness) endpoints
- [ ] Liveness: check that the process is running (simple 200 OK)
- [ ] Readiness: check MongoDB connectivity, Redis connectivity (if configured), and disk space
- [ ] Update \`k8s/api/deployment.yaml\` to use separate liveness and readiness probe paths
- [ ] Add a \`/health/startup\` probe for slow startup scenarios
- [ ] Update Helm chart templates to use the improved probes
- [ ] Add timeout and failure threshold configuration to the probes
- [ ] Write tests for the health endpoints

## Acceptance Criteria

- \`/health/live\` returns 200 if the process is running
- \`/health/ready\` returns 503 if MongoDB is unreachable
- \`/health/ready\` returns 503 if Redis is configured but unreachable
- Kubernetes deployment uses separate liveness and readiness probes
- Tests verify health check behavior under various failure conditions"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add prescription drug interaction check at encounter save time" \
  --label "enhancement,clinical,safety" \
  --body "## Description

The \`apps/api/src/modules/ai/ai.service.ts\` has a \`checkDrugInteractions\` function, and the \`apps/api/src/modules/ai/ai.routes.ts\` exposes it as an endpoint. However, drug interaction checking is not automatically triggered when a prescription is added to an encounter in \`encounters.controller.ts\`.

Clinicians must manually invoke the drug interaction check. This means interactions can be missed if the clinician forgets to check.

**Why it matters in production:** Missed drug interactions are a patient safety issue. Automating the check at prescription save time provides a safety net.

## Tasks

- [ ] Add automatic drug interaction checking when a prescription is added to an encounter
- [ ] If a severe interaction is detected, return a warning in the API response (not a hard block)
- [ ] Store the interaction check result in the prescription record
- [ ] Add an \`allergyOverride\` mechanism for when the doctor acknowledges and overrides the warning
- [ ] Emit a \`prescription:interaction_warning\` Socket.IO event to the doctor
- [ ] Add the interaction check result to the encounter audit log
- [ ] Make the automatic check configurable (can be disabled per clinic)
- [ ] Write tests for the automatic interaction check

## Acceptance Criteria

- Adding a prescription to an encounter automatically triggers a drug interaction check
- Severe interactions return a warning in the API response
- Doctors can override warnings with a documented reason
- Interaction check results are stored in the prescription record
- Tests cover interaction detection, warning, and override flows"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Sentry error tracking configuration for production" \
  --label "enhancement,observability,reliability" \
  --body "## Description

The project has Sentry configuration files: \`apps/web/sentry.client.config.ts\`, \`apps/web/sentry.server.config.ts\`, and \`apps/web/sentry.edge.config.ts\`. The \`.sentry/alerts.yml\` file defines alert rules. However, the API (\`apps/api\`) does not appear to have Sentry integration configured, and the \`apps/api/src/instrument.ts\` file may be incomplete.

Without Sentry on the API, unhandled errors in the backend are only logged to the console/pino and not tracked in a centralized error monitoring system.

**Why it matters in production:** Untracked errors in the API mean the team is unaware of production issues until users report them. Sentry provides real-time error alerting and stack traces.

## Tasks

- [ ] Complete the Sentry SDK initialization in \`apps/api/src/instrument.ts\`
- [ ] Configure Sentry DSN via environment variable \`SENTRY_DSN\`
- [ ] Add \`SENTRY_DSN\` to \`env.ts\` Zod schema (optional)
- [ ] Integrate Sentry with the Express error handler in \`error.middleware.ts\`
- [ ] Configure Sentry to scrub PHI from error reports (use \`beforeSend\` hook)
- [ ] Add \`SENTRY_DSN\` to \`.env.example\`, Helm values, and k8s ConfigMap
- [ ] Configure Sentry performance monitoring for slow API endpoints
- [ ] Write a test that verifies PHI is scrubbed from Sentry reports
- [ ] Update \`.sentry/alerts.yml\` with API-specific alert rules

## Acceptance Criteria

- Unhandled API errors are reported to Sentry
- PHI fields are scrubbed from Sentry error reports
- Sentry performance monitoring tracks slow endpoints
- \`SENTRY_DSN\` is documented in \`.env.example\`
- Test verifies PHI scrubbing in Sentry \`beforeSend\` hook"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add referral tracking and outcome reporting" \
  --label "enhancement,clinical,reporting" \
  --body "## Description

The \`apps/api/src/modules/referrals/referrals.controller.ts\` and \`referral.model.ts\` implement patient referrals. However, there is no mechanism to track the outcome of referrals (whether the patient attended the referred appointment, what the outcome was) or to generate referral analytics reports.

Clinics need to track referral completion rates to measure care coordination effectiveness and comply with value-based care requirements.

**Why it matters in production:** Without referral outcome tracking, clinics cannot measure the effectiveness of their referral network or identify patients who are not following through on referrals.

## Tasks

- [ ] Add \`outcome\`, \`outcomeDate\`, \`outcomeNotes\`, and \`completedAt\` fields to \`referral.model.ts\`
- [ ] Add a \`PATCH /api/v1/referrals/:id/outcome\` endpoint to record referral outcomes
- [ ] Add a \`GET /api/v1/referrals/analytics\` endpoint with completion rates, average time to completion, and top referral destinations
- [ ] Add referral outcome tracking to the audit log
- [ ] Send a notification to the referring doctor when a referral outcome is recorded
- [ ] Add referral metrics to the dashboard
- [ ] Write tests for outcome recording and analytics
- [ ] Update Swagger docs for the new endpoints

## Acceptance Criteria

- Referral outcomes can be recorded via the API
- Analytics endpoint returns completion rates and timing metrics
- Referring doctor is notified when outcome is recorded
- Audit log records outcome changes
- Tests cover outcome recording and analytics calculation"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add mobile-responsive design testing to CI with Playwright" \
  --label "enhancement,testing,frontend" \
  --body "## Description

The project has a \`apps/web/MOBILE_RESPONSIVE_GUIDE.md\` and \`apps/web/tailwind.config.responsive.js\` indicating mobile responsiveness is a priority. However, the existing Playwright E2E tests (\`apps/web/e2e/\`) run only in desktop viewport. There are no tests that verify the mobile layout works correctly.

The \`apps/web/playwright.config.ts\` may not configure mobile viewports.

**Why it matters in production:** Healthcare providers increasingly use tablets and mobile devices at the point of care. A broken mobile layout can prevent clinicians from accessing patient information when needed.

## Tasks

- [ ] Update \`playwright.config.ts\` to add mobile viewport configurations (iPhone 12, iPad)
- [ ] Add mobile-specific E2E tests for the patient list, encounter creation, and payment flows
- [ ] Test that navigation menus collapse correctly on mobile
- [ ] Test that forms are usable on mobile (no overflow, proper input sizing)
- [ ] Add visual regression tests using Playwright screenshots for mobile viewports
- [ ] Add the mobile E2E tests to the CI pipeline
- [ ] Fix any mobile layout issues discovered during testing
- [ ] Update \`MOBILE_RESPONSIVE_GUIDE.md\` with testing instructions

## Acceptance Criteria

- E2E tests run on iPhone 12 and iPad viewports in CI
- All critical user flows pass on mobile viewports
- Visual regression tests catch layout regressions
- No horizontal scrolling on mobile viewports
- CI fails if mobile tests fail"

echo "Issues 41-50 created successfully"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Progressive Web App offline support for critical clinical data" \
  --label "enhancement,frontend,pwa" \
  --body "## Description

The project has a \`apps/web/public/sw.js\` service worker and \`apps/web/public/manifest.json\` PWA manifest, indicating PWA support is planned. However, the service worker may not implement offline caching for critical clinical data (patient lists, recent encounters).

In clinical settings, internet connectivity can be unreliable. Clinicians should be able to view recently accessed patient records even when offline.

**Why it matters in production:** A clinician who loses internet connectivity mid-consultation cannot access patient records if there is no offline support. This can disrupt patient care.

## Tasks

- [ ] Implement a service worker caching strategy for the patient list and recent encounters
- [ ] Use a stale-while-revalidate strategy for non-sensitive data
- [ ] Implement a network-first strategy for PHI data (only cache if explicitly requested)
- [ ] Add an offline indicator in the UI when the network is unavailable
- [ ] Implement background sync for form submissions made while offline
- [ ] Add a \`Cache-Control\` header strategy for API responses
- [ ] Test offline functionality with Playwright's network throttling
- [ ] Document the offline data policy (what is cached, for how long)

## Acceptance Criteria

- Patient list is accessible offline after initial load
- Offline indicator is shown when network is unavailable
- Form submissions are queued and synced when connectivity is restored
- PHI is not cached in the service worker without explicit user action
- Playwright tests verify offline functionality"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add subscription usage enforcement — block API calls when plan limits are exceeded" \
  --label "enhancement,billing,api" \
  --body "## Description

The \`apps/api/src/modules/subscriptions/\` directory contains subscription tiers, usage tracking, and billing services. The \`apps/api/src/middlewares/subscription.middleware.ts\` exists but may not be applied to all relevant endpoints.

If a clinic on the Basic plan (with a patient limit) can create unlimited patients by bypassing the subscription check, the billing model is broken.

**Why it matters in production:** Without enforced subscription limits, clinics can use the platform beyond their paid tier, resulting in revenue loss and unfair competition between tiers.

## Tasks

- [ ] Audit \`subscription.middleware.ts\` to confirm it checks all relevant limits
- [ ] Apply the subscription middleware to patient creation, encounter creation, and user creation endpoints
- [ ] Return a clear \`402 Payment Required\` response with upgrade instructions when limits are exceeded
- [ ] Add a \`GET /api/v1/subscriptions/usage\` endpoint showing current usage vs. limits
- [ ] Add a warning notification when usage reaches 80% of the plan limit
- [ ] Add a Prometheus metric for subscription limit violations
- [ ] Write tests for each subscription tier's limits
- [ ] Update the frontend to show usage meters

## Acceptance Criteria

- Creating a patient beyond the plan limit returns 402
- \`GET /api/v1/subscriptions/usage\` returns accurate usage data
- Warning notification is sent at 80% usage
- Prometheus tracks limit violations
- Tests verify enforcement for each tier"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add care plan progress tracking and goal completion metrics" \
  --label "enhancement,clinical,reporting" \
  --body "## Description

The \`apps/api/src/modules/care-plans/care-plans.controller.ts\` and \`care-plan.model.ts\` implement care plan management. However, care plans likely lack progress tracking — the ability to mark individual goals as completed, track completion percentage, and generate progress reports.

Effective care plan management requires tracking whether patients are meeting their health goals over time.

**Why it matters in production:** Without progress tracking, care plans are static documents rather than dynamic management tools. Clinicians cannot quickly assess which patients are on track with their care plans.

## Tasks

- [ ] Add \`goals\` array to \`care-plan.model.ts\` with \`description\`, \`targetDate\`, \`status\`, and \`completedAt\` fields
- [ ] Add a \`PATCH /api/v1/care-plans/:id/goals/:goalId\` endpoint to update goal status
- [ ] Add a \`completionPercentage\` computed field to the care plan response
- [ ] Add a \`GET /api/v1/care-plans/analytics\` endpoint with completion rates by condition
- [ ] Emit a \`care_plan:goal_completed\` Socket.IO event when a goal is marked complete
- [ ] Add care plan progress to the patient dashboard
- [ ] Write tests for goal tracking and analytics
- [ ] Update Swagger docs

## Acceptance Criteria

- Care plan goals can be marked as completed via the API
- Completion percentage is returned in the care plan response
- Analytics endpoint returns completion rates
- Socket.IO event is emitted on goal completion
- Tests cover goal tracking and analytics"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add immunization schedule compliance tracking and overdue alerts" \
  --label "enhancement,clinical,immunizations" \
  --body "## Description

The \`apps/api/src/modules/immunizations/immunization-schedule.service.ts\` implements immunization schedule logic. However, there is no automated tracking of which patients are overdue for scheduled immunizations, and no alerting mechanism to notify clinicians of overdue patients.

**Why it matters in production:** Immunization compliance is a key public health metric. Clinics need to proactively identify and contact patients who are overdue for vaccinations.

## Tasks

- [ ] Create an \`immunization-compliance-job.ts\` that runs daily
- [ ] Identify patients who are overdue for scheduled immunizations based on their age and vaccination history
- [ ] Create notifications for the attending doctor when a patient is overdue
- [ ] Add a \`GET /api/v1/immunizations/overdue\` endpoint listing overdue patients
- [ ] Add an \`overdueCount\` metric to the dashboard
- [ ] Send email reminders to patients (via portal) for overdue immunizations
- [ ] Add immunization compliance to the patient risk score calculation
- [ ] Write tests for the compliance job

## Acceptance Criteria

- Daily job identifies overdue immunizations
- Notifications are sent to attending doctors
- \`GET /api/v1/immunizations/overdue\` returns accurate data
- Dashboard shows overdue immunization count
- Tests cover compliance detection logic"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add document version control for uploaded clinical documents" \
  --label "enhancement,clinical,documents" \
  --body "## Description

The \`apps/api/src/modules/documents/documents.controller.ts\` and \`storage.service.ts\` handle document uploads. However, there is no version control for documents. When a document is updated (e.g., a revised consent form or updated lab report), the previous version is overwritten with no history.

In a HIPAA environment, maintaining document version history is important for audit purposes and legal compliance.

**Why it matters in production:** Overwriting clinical documents without version history can destroy evidence needed for legal proceedings or HIPAA audits.

## Tasks

- [ ] Add \`version\`, \`previousVersionId\`, and \`isLatest\` fields to \`document.model.ts\`
- [ ] When a document is updated, create a new version record instead of overwriting
- [ ] Add a \`GET /api/v1/documents/:id/versions\` endpoint listing all versions
- [ ] Add a \`GET /api/v1/documents/:id/versions/:version\` endpoint to retrieve a specific version
- [ ] Implement soft delete (mark as deleted, don't remove from storage)
- [ ] Add document version history to the audit log
- [ ] Update the frontend to show version history
- [ ] Write tests for version control

## Acceptance Criteria

- Updating a document creates a new version, not an overwrite
- All previous versions are accessible via the API
- Deleted documents are soft-deleted (not removed from storage)
- Audit log records all version changes
- Tests cover version creation, retrieval, and soft delete"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar multi-signature payment support for high-value transactions" \
  --label "enhancement,blockchain,security" \
  --body "## Description

The \`.kiro/specs/stellar-multisig-payments/requirements.md\` and \`.kiro/specs/stellar-multi-sig-payments/\` specs define requirements for multi-signature payments. However, the current payment implementation in \`apps/api/src/modules/payments/payments.controller.ts\` and \`apps/stellar-service/src/stellar.ts\` does not implement multi-signature transaction building.

For high-value healthcare payments, requiring multiple signatories (e.g., clinic admin + doctor) provides an additional security layer.

**Why it matters in production:** High-value payments without multi-signature approval are vulnerable to insider fraud. A single compromised account could initiate large unauthorized payments.

## Tasks

- [ ] Implement multi-signature transaction building in \`apps/stellar-service/src/stellar.ts\`
- [ ] Add a \`requiresMultiSig\` flag to \`PaymentRecordModel\` for payments above a configurable threshold
- [ ] Create a \`POST /api/v1/payments/:id/cosign\` endpoint for the second signatory
- [ ] Add a \`pending_cosignature\` status to the payment status enum
- [ ] Emit a \`payment:cosignature_required\` Socket.IO event to the clinic admin
- [ ] Add multi-sig configuration to clinic settings
- [ ] Write tests for the multi-sig payment flow
- [ ] Update Swagger docs

## Acceptance Criteria

- Payments above the threshold require a second signature
- Second signatory receives a real-time notification
- Payment is only submitted to Stellar after both signatures
- Multi-sig threshold is configurable per clinic
- Tests cover the full multi-sig flow"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add AI-powered risk stratification batch processing" \
  --label "enhancement,ai,clinical" \
  --body "## Description

The \`apps/api/src/modules/patients/risk-recalculation-job.ts\` runs risk score recalculation for patients. The \`apps/api/src/modules/ai/risk-calculator.ts\` implements the risk calculation logic. However, the batch processing may not be optimized for large patient populations.

The \`.changeset/feat-ai-risk-stratification.md\` indicates this feature is in progress. The risk recalculation job should process patients in batches to avoid memory issues and provide progress tracking.

**Why it matters in production:** Risk stratification is used to prioritize high-risk patients for proactive care. If the job is slow or fails silently, high-risk patients may not be identified in time.

## Tasks

- [ ] Implement cursor-based batch processing in \`risk-recalculation-job.ts\` (process 100 patients at a time)
- [ ] Add progress tracking: log percentage complete and estimated time remaining
- [ ] Add a Prometheus gauge for the number of patients with outdated risk scores
- [ ] Add a \`GET /api/v1/patients/risk-summary\` endpoint showing risk distribution
- [ ] Implement priority processing: recalculate high-risk patients more frequently
- [ ] Add error handling for individual patient calculation failures (don't fail the entire batch)
- [ ] Write tests for batch processing and error handling
- [ ] Add a manual trigger endpoint for SUPER_ADMIN

## Acceptance Criteria

- Risk recalculation processes patients in batches of 100
- Individual patient failures don't stop the batch
- Prometheus tracks outdated risk score count
- \`GET /api/v1/patients/risk-summary\` returns risk distribution
- Tests cover batch processing and error handling"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add encounter outcome tracking per spec requirements" \
  --label "enhancement,clinical,reporting" \
  --body "## Description

The \`.kiro/specs/encounter-outcome-tracking/requirements.md\` and \`design.md\` define requirements for tracking encounter outcomes. The \`tasks.md\` lists implementation tasks. However, the current \`EncounterModel\` in \`encounter.model.ts\` does not include outcome tracking fields (e.g., \`outcome\`, \`outcomeDate\`, \`followUpRequired\`, \`patientSatisfaction\`).

Tracking encounter outcomes is essential for measuring clinical quality and identifying areas for improvement.

**Why it matters in production:** Without outcome tracking, clinics cannot measure the effectiveness of their treatments or comply with value-based care reporting requirements.

## Tasks

- [ ] Add \`outcome\`, \`outcomeDate\`, \`outcomeNotes\`, \`followUpRequired\`, and \`patientSatisfactionScore\` fields to \`encounter.model.ts\`
- [ ] Add a \`PATCH /api/v1/encounters/:id/outcome\` endpoint
- [ ] Add outcome analytics to the reports module
- [ ] Link encounter outcomes to care plan goal completion
- [ ] Add outcome tracking to the encounter audit log
- [ ] Create a migration for the new fields
- [ ] Write tests for outcome recording and analytics
- [ ] Update Swagger docs

## Acceptance Criteria

- Encounter outcomes can be recorded via the API
- Outcome analytics are available in the reports module
- Outcomes are linked to care plan goals where applicable
- Audit log records outcome changes
- Migration creates the new fields on existing encounters"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Soroban smart contract integration for automated payment escrow" \
  --label "enhancement,blockchain,smart-contracts" \
  --body "## Description

The \`.kiro/specs/stellar-soroban-integration/requirements.md\` and \`design.md\` define requirements for Stellar Soroban smart contract integration. The \`tasks.md\` lists implementation tasks. Soroban contracts could automate payment escrow, ensuring funds are only released when specific conditions are met (e.g., encounter is closed, patient confirms service received).

**Why it matters in production:** Automated escrow via smart contracts reduces payment disputes and provides transparent, auditable payment conditions for both clinics and patients.

## Tasks

- [ ] Implement Soroban contract deployment in \`apps/stellar-service/src/operations/\`
- [ ] Create an escrow contract that holds payment until encounter closure
- [ ] Add \`sorobanContractId\` field to \`PaymentRecordModel\`
- [ ] Add a \`POST /api/v1/payments/:id/escrow\` endpoint to create an escrow
- [ ] Add a \`POST /api/v1/payments/:id/release\` endpoint to release escrow funds
- [ ] Integrate escrow release with encounter closure in \`encounters.controller.ts\`
- [ ] Write tests for the escrow flow
- [ ] Update Swagger docs

## Acceptance Criteria

- Payments can be held in Soroban escrow
- Escrow is automatically released when the encounter is closed
- \`sorobanContractId\` is stored in the payment record
- Tests cover escrow creation, holding, and release
- Swagger docs describe the escrow flow"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add encounter attachment support per spec requirements" \
  --label "enhancement,clinical,documents" \
  --body "## Description

The \`.kiro/specs/encounter-attachments/requirements.md\` and \`design.md\` define requirements for attaching files (images, PDFs, lab reports) to encounters. The \`tasks.md\` lists implementation tasks. Currently, encounters can only contain text-based SOAP notes and structured data. Clinicians need to attach supporting documents like X-rays, ECG printouts, and referral letters.

**Why it matters in production:** Clinical documentation often includes images and scanned documents. Without attachment support, clinicians must maintain separate document management systems.

## Tasks

- [ ] Add an \`attachments\` array field to \`encounter.model.ts\` with \`fileId\`, \`fileName\`, \`fileType\`, \`uploadedBy\`, and \`uploadedAt\` fields
- [ ] Create \`POST /api/v1/encounters/:id/attachments\` endpoint for file upload
- [ ] Create \`GET /api/v1/encounters/:id/attachments\` endpoint for listing attachments
- [ ] Create \`DELETE /api/v1/encounters/:id/attachments/:attachmentId\` endpoint
- [ ] Integrate with the existing \`storage.service.ts\` for S3 upload
- [ ] Add file type validation (allow: PDF, JPEG, PNG, DICOM)
- [ ] Add file size limits (configurable, default 10MB)
- [ ] Write tests for attachment upload, retrieval, and deletion

## Acceptance Criteria

- Files can be attached to encounters via the API
- Attachments are stored in S3 and referenced in the encounter record
- File type and size validation is enforced
- Attachments are included in the encounter audit log
- Tests cover upload, retrieval, and deletion"

echo "Issues 51-60 created successfully"
