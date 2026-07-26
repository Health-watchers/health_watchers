#!/usr/bin/env bash
set -e
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient communication log per spec requirements" \
  --label "enhancement,clinical,communication" \
  --body "## Description

The \`.kiro/specs/patient-communication-log/requirements.md\`, \`design.md\`, and \`tasks.md\` define requirements for tracking all communications with patients (phone calls, emails, SMS, portal messages). Currently, there is no dedicated communication log in the system.

Tracking patient communications is important for care coordination, legal compliance, and ensuring continuity of care when staff changes.

**Why it matters in production:** Without a communication log, there is no record of what was communicated to patients, when, and by whom. This creates liability risks and care coordination gaps.

## Tasks

- [ ] Create \`CommunicationLogModel\` with fields: \`patientId\`, \`clinicId\`, \`userId\`, \`type\` (call/email/sms/portal), \`direction\` (inbound/outbound), \`summary\`, \`duration\`, \`timestamp\`
- [ ] Create \`POST /api/v1/patients/:id/communications\` endpoint
- [ ] Create \`GET /api/v1/patients/:id/communications\` endpoint with pagination
- [ ] Add communication log to the patient timeline view
- [ ] Add \`COMMUNICATION_LOG\` to the \`AuditAction\` enum
- [ ] Create a migration for the new collection
- [ ] Write tests for communication log CRUD operations
- [ ] Update Swagger docs

## Acceptance Criteria

- Communications can be logged via the API
- Communication history is paginated and filterable by type
- Audit log records communication log entries
- Patient timeline includes communication history
- Tests cover all CRUD operations"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add AI voice transcription for clinical notes per spec requirements" \
  --label "enhancement,ai,clinical" \
  --body "## Description

The \`.kiro/specs/ai-voice-transcription/requirements.md\`, \`design.md\`, and \`tasks.md\` define requirements for AI-powered voice transcription of clinical notes. Clinicians should be able to dictate SOAP notes and have them automatically transcribed and structured.

**Why it matters in production:** Manual note-taking is time-consuming and reduces the time clinicians spend with patients. Voice transcription can significantly improve clinical efficiency.

## Tasks

- [ ] Add a \`POST /api/v1/ai/transcribe\` endpoint that accepts audio files
- [ ] Integrate with Google Speech-to-Text or Gemini's audio capabilities
- [ ] Implement PII stripping on transcribed text before storage
- [ ] Add structured note extraction (identify SOAP sections from free-form dictation)
- [ ] Add a \`transcriptionId\` field to the encounter model for linking transcriptions
- [ ] Implement real-time transcription streaming via WebSocket
- [ ] Add audio file validation (format, size, duration limits)
- [ ] Write tests for transcription and PII stripping

## Acceptance Criteria

- Audio files can be uploaded and transcribed via the API
- Transcribed text has PII stripped before storage
- SOAP sections are automatically identified in transcriptions
- Real-time streaming transcription works via WebSocket
- Tests cover transcription, PII stripping, and SOAP extraction"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar batch payment processing per spec requirements" \
  --label "enhancement,blockchain,payments" \
  --body "## Description

The \`.kiro/specs/stellar-batch-payments/requirements.md\`, \`design.md\`, and \`tasks.md\` define requirements for processing multiple Stellar payments in a single transaction. Currently, each payment is a separate Stellar transaction, which is inefficient for bulk billing scenarios (e.g., end-of-month insurance reimbursements).

**Why it matters in production:** Batch payments reduce Stellar transaction fees and improve processing efficiency for high-volume payment scenarios.

## Tasks

- [ ] Implement batch transaction building in \`apps/stellar-service/src/operations/\`
- [ ] Add a \`POST /api/v1/payments/batch\` endpoint accepting an array of payment intents
- [ ] Create a \`BatchPaymentModel\` to track batch status
- [ ] Implement atomic batch processing (all succeed or all fail)
- [ ] Add batch payment status polling endpoint
- [ ] Add batch payment to the audit log
- [ ] Write tests for batch payment creation and processing
- [ ] Update Swagger docs

## Acceptance Criteria

- Multiple payments can be submitted as a single batch
- Batch is atomic (all succeed or all fail)
- Batch status can be polled via the API
- Audit log records batch payment events
- Tests cover batch creation, processing, and failure scenarios"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add API pagination standardization per spec requirements" \
  --label "enhancement,api,developer-experience" \
  --body "## Description

The \`.kiro/specs/api-pagination-standardization/requirements.md\`, \`design.md\`, and \`tasks.md\` define requirements for standardizing pagination across all API endpoints. Currently, pagination is inconsistent: some endpoints use \`page\`/\`limit\`, others use different parameter names, and response envelopes vary.

**Why it matters in production:** Inconsistent pagination makes frontend development error-prone and prevents building generic pagination components.

## Tasks

- [ ] Define a standard pagination request schema: \`{ page, limit, cursor, sortBy, sortOrder }\`
- [ ] Define a standard pagination response envelope: \`{ data, meta: { total, page, limit, totalPages, hasNextPage, nextCursor } }\`
- [ ] Update all paginated endpoints to use the standard schema
- [ ] Add a \`parsePaginationStandard\` utility function
- [ ] Update the frontend API client to use the standard envelope
- [ ] Add OpenAPI schema definitions for the pagination types
- [ ] Write tests for the pagination utility
- [ ] Update all Swagger docs to use the standard pagination schema

## Acceptance Criteria

- All paginated endpoints use the same request parameters
- All paginated responses use the same envelope structure
- Frontend pagination components work with all endpoints
- OpenAPI spec defines reusable pagination schemas
- Tests verify the standard pagination behavior"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add data anonymization for research exports per spec requirements" \
  --label "enhancement,compliance,research" \
  --body "## Description

The \`.kiro/specs/data-anonymization/requirements.md\` defines requirements for anonymizing patient data for research purposes. The \`packages/anonymize/src/index.ts\` implements anonymization logic, but it may not be fully integrated with the export module.

Research exports must comply with HIPAA's Safe Harbor de-identification standard (removing 18 specific identifiers) or the Expert Determination method.

**Why it matters in production:** Sharing non-anonymized patient data for research is a HIPAA violation. Proper anonymization enables valuable research while protecting patient privacy.

## Tasks

- [ ] Verify \`packages/anonymize/src/index.ts\` removes all 18 HIPAA Safe Harbor identifiers
- [ ] Add a \`GET /api/v1/export/research\` endpoint that exports anonymized data
- [ ] Implement the Expert Determination anonymization level
- [ ] Add a research export audit log entry
- [ ] Require SUPER_ADMIN role for research exports
- [ ] Add a data use agreement acceptance step before export
- [ ] Write tests verifying all 18 identifiers are removed
- [ ] Document the anonymization methodology

## Acceptance Criteria

- Research exports remove all 18 HIPAA Safe Harbor identifiers
- Expert Determination anonymization is available
- Research exports require SUPER_ADMIN role and DUA acceptance
- Audit log records all research exports
- Tests verify identifier removal"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add request ID propagation per spec requirements" \
  --label "enhancement,observability,infrastructure" \
  --body "## Description

The \`.kiro/specs/request-id-propagation/\` spec defines requirements for propagating request IDs across all services. The API generates request IDs via \`pinoHttp\` and the \`traceIdHeader\` middleware, but propagation to the stellar-service and other downstream calls may be incomplete.

**Why it matters in production:** Without consistent request ID propagation, correlating logs across services during incident investigation is extremely difficult.

## Tasks

- [ ] Ensure \`x-request-id\` is generated for every incoming request
- [ ] Propagate \`x-request-id\` to all outgoing HTTP calls (stellar-service, email service, etc.)
- [ ] Add \`x-request-id\` to all API responses
- [ ] Log \`x-request-id\` in all structured log entries
- [ ] Add \`x-request-id\` to Socket.IO event payloads
- [ ] Add \`x-request-id\` to audit log entries
- [ ] Write tests verifying request ID propagation
- [ ] Update the frontend to include \`x-request-id\` in API requests

## Acceptance Criteria

- Every API request has a unique \`x-request-id\`
- \`x-request-id\` is included in all downstream service calls
- All log entries include the request ID
- Audit log entries include the request ID
- Tests verify end-to-end request ID propagation"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add settings and profile management per spec requirements" \
  --label "enhancement,frontend,user-management" \
  --body "## Description

The \`.kiro/specs/settings-profile/\` spec defines requirements for user settings and profile management. Users should be able to update their profile information, notification preferences, language settings, and security settings (password change, MFA management) from a unified settings page.

**Why it matters in production:** Without a proper settings page, users cannot manage their own accounts, leading to support requests for basic account management tasks.

## Tasks

- [ ] Create a settings page in \`apps/web/src/app/settings/\`
- [ ] Add profile editing (name, email, language preference)
- [ ] Add notification preference management (all types from \`UserPreferences\`)
- [ ] Add password change functionality
- [ ] Add MFA setup/disable functionality
- [ ] Add active session management (view and revoke sessions)
- [ ] Add API key management for developers
- [ ] Write E2E tests for the settings page

## Acceptance Criteria

- Users can update their profile information
- Notification preferences are saved and respected
- Password change requires current password verification
- MFA can be enabled/disabled from settings
- Active sessions can be viewed and revoked
- E2E tests cover all settings sections"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar fee-bump transaction support for sponsored transactions" \
  --label "enhancement,blockchain,payments" \
  --body "## Description

The \`apps/api/src/modules/payments/services/stellar-client.ts\` has a \`sponsorFeeBump\` method that calls the stellar-service's \`/fee-bump\` endpoint. However, it's not clear if this is integrated into the payment flow for cases where the clinic wants to sponsor transaction fees for patients.

Fee-bump transactions allow the clinic to pay Stellar network fees on behalf of patients, improving the patient payment experience.

**Why it matters in production:** Requiring patients to hold XLM for transaction fees creates friction in the payment process. Fee sponsorship removes this barrier.

## Tasks

- [ ] Implement fee-bump transaction building in \`apps/stellar-service/src/stellar.ts\`
- [ ] Add a \`sponsorFees\` option to the payment intent creation request
- [ ] Integrate fee-bump with the payment confirmation flow
- [ ] Add a clinic setting to enable/disable fee sponsorship
- [ ] Track sponsored fee amounts in \`PaymentRecordModel\`
- [ ] Add fee sponsorship to the payment receipt
- [ ] Write tests for fee-bump transaction building
- [ ] Update Swagger docs

## Acceptance Criteria

- Clinics can opt to sponsor transaction fees for patients
- Fee-bump transactions are built correctly for sponsored payments
- Sponsored fee amounts are tracked in payment records
- Fee sponsorship is reflected in payment receipts
- Tests cover fee-bump transaction building"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add comprehensive accessibility (WCAG 2.1 AA) compliance testing" \
  --label "enhancement,accessibility,frontend" \
  --body "## Description

The \`apps/web/tests/accessibility.spec.ts\` file exists but may contain only basic accessibility tests. WCAG 2.1 AA compliance requires testing for keyboard navigation, screen reader compatibility, color contrast, focus management, and ARIA attributes across all pages.

Healthcare applications must be accessible to users with disabilities, including clinicians who use assistive technologies.

**Why it matters in production:** Inaccessible healthcare software can prevent clinicians with disabilities from doing their jobs. In some jurisdictions, accessibility compliance is legally required.

## Tasks

- [ ] Expand \`accessibility.spec.ts\` to test all major pages (patients, encounters, payments, settings)
- [ ] Add axe-core integration for automated WCAG 2.1 AA testing
- [ ] Test keyboard navigation for all interactive elements
- [ ] Test screen reader announcements for dynamic content (notifications, form errors)
- [ ] Test color contrast ratios for all text elements
- [ ] Test focus management in modals and dialogs
- [ ] Fix all accessibility violations found during testing
- [ ] Add accessibility testing to the CI pipeline

## Acceptance Criteria

- axe-core reports zero WCAG 2.1 AA violations on all major pages
- All interactive elements are keyboard accessible
- Screen reader announcements work for dynamic content
- Color contrast meets WCAG 2.1 AA requirements
- CI fails if accessibility violations are introduced"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Prometheus metrics for business KPIs (patients created, encounters, payments)" \
  --label "enhancement,observability,monitoring" \
  --body "## Description

The \`apps/api/src/services/metrics.service.ts\` defines Prometheus metrics including \`patientsCreatedTotal\`, \`encountersCreatedTotal\`, and \`paymentsInitiatedTotal\`. However, these metrics may not be comprehensive enough for business monitoring. Key business KPIs like daily active users, average encounter duration, payment success rate, and revenue per clinic are not tracked.

**Why it matters in production:** Business KPIs in Prometheus/Grafana enable real-time monitoring of platform health and early detection of business anomalies (e.g., sudden drop in payment success rate).

## Tasks

- [ ] Add \`payment_success_rate\` gauge metric
- [ ] Add \`encounter_duration_seconds\` histogram metric
- [ ] Add \`active_users_total\` gauge metric (updated on login/logout)
- [ ] Add \`api_key_requests_total\` counter by key and endpoint
- [ ] Add \`stellar_transaction_fee_xlm\` histogram for fee tracking
- [ ] Create a Grafana dashboard for business KPIs
- [ ] Add alerting rules for payment success rate drops below 95%
- [ ] Write tests for metric recording

## Acceptance Criteria

- All new metrics are exposed at \`/metrics\`
- Grafana dashboard shows business KPIs
- Alert fires when payment success rate drops below 95%
- Metrics are labeled by clinic for multi-tenant analysis
- Tests verify metric recording"

echo "Issues 61-70 created successfully"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add CDS (Clinical Decision Support) rule management UI" \
  --label "enhancement,clinical,frontend" \
  --body "## Description

The \`apps/api/src/modules/cds/\` directory contains a CDS rules engine (\`cds-rules-engine.ts\`), rule model (\`cds-rule.model.ts\`), controller (\`cds.controller.ts\`), and seed data (\`cds-seed.ts\`). The CDS engine is integrated into encounter creation. However, there is no frontend UI for clinic administrators to view, create, or modify CDS rules.

**Why it matters in production:** Without a UI, CDS rules can only be managed by developers with database access. Clinic administrators need to be able to customize clinical decision support rules for their specific patient population.

## Tasks

- [ ] Create a CDS rules management page in \`apps/web/src/app/settings/cds-rules/\`
- [ ] Add a list view showing all active CDS rules with their conditions and actions
- [ ] Add a form for creating new CDS rules
- [ ] Add rule editing and deactivation functionality
- [ ] Add rule testing (simulate a patient scenario and see which rules fire)
- [ ] Add rule priority ordering (drag-and-drop)
- [ ] Write E2E tests for the CDS rules management UI
- [ ] Update Swagger docs for CDS endpoints

## Acceptance Criteria

- Clinic admins can view all CDS rules
- New rules can be created via the UI
- Rules can be edited and deactivated
- Rule testing shows which rules would fire for a given patient scenario
- E2E tests cover rule management"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add invoice PDF generation with clinic branding" \
  --label "enhancement,billing,frontend" \
  --body "## Description

The \`apps/api/src/modules/invoices/invoice-pdf.service.ts\` generates invoice PDFs. However, the PDFs may use a generic template without clinic-specific branding (logo, colors, address). Clinics need branded invoices for professional billing.

**Why it matters in production:** Unbranded invoices look unprofessional and may not meet the requirements of insurance companies or patients who need official billing documentation.

## Tasks

- [ ] Add clinic logo upload to clinic settings
- [ ] Add clinic address, phone, and tax ID fields to clinic settings
- [ ] Update \`invoice-pdf.service.ts\` to include clinic branding
- [ ] Add a PDF preview endpoint: \`GET /api/v1/invoices/:id/preview\`
- [ ] Add invoice template customization (header, footer, color scheme)
- [ ] Add digital signature support for invoices
- [ ] Write tests for PDF generation with branding
- [ ] Update the frontend invoice view to show the branded PDF

## Acceptance Criteria

- Invoice PDFs include clinic logo, address, and contact information
- Clinic branding is configurable via the settings page
- PDF preview is available before sending
- Digital signatures are supported
- Tests verify branding elements in generated PDFs"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add telemedicine video consultation integration" \
  --label "enhancement,clinical,telemedicine" \
  --body "## Description

The \`apps/api/src/modules/appointments/telemedicine.service.ts\` exists, indicating telemedicine support is planned. The \`EncounterModel\` has a \`type\` field that includes \`'telemedicine'\`. However, the telemedicine service may not be fully implemented with actual video conferencing integration.

**Why it matters in production:** Telemedicine is increasingly important for patient access to care. Without video consultation support, the platform cannot serve remote patients.

## Tasks

- [ ] Integrate with a video conferencing API (Twilio Video, Daily.co, or Jitsi)
- [ ] Add \`videoRoomId\`, \`videoRoomUrl\`, and \`videoStartedAt\` fields to \`appointment.model.ts\`
- [ ] Create \`POST /api/v1/appointments/:id/video/start\` endpoint
- [ ] Create \`POST /api/v1/appointments/:id/video/end\` endpoint
- [ ] Add video consultation recording support (with patient consent)
- [ ] Emit \`appointment:video_started\` Socket.IO event to both parties
- [ ] Add telemedicine to the appointment scheduling UI
- [ ] Write tests for the telemedicine flow

## Acceptance Criteria

- Video consultations can be started from scheduled appointments
- Both doctor and patient receive video room links
- Video sessions are recorded with patient consent
- Socket.IO events notify both parties when video starts/ends
- Tests cover the telemedicine flow"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient portal messaging system" \
  --label "enhancement,portal,communication" \
  --body "## Description

The patient portal (\`apps/api/src/modules/portal/portal.controller.ts\`) allows patients to view their records. However, there is no secure messaging system for patients to communicate with their care team. Secure messaging is a key feature of modern patient portals and is required for meaningful use compliance.

**Why it matters in production:** Patients need a secure way to ask questions, request prescription refills, and communicate with their care team without using unsecured email.

## Tasks

- [ ] Create a \`PortalMessageModel\` with \`patientId\`, \`clinicId\`, \`subject\`, \`body\`, \`direction\`, \`readAt\`, and \`attachments\` fields
- [ ] Create \`POST /api/v1/portal/messages\` endpoint for patients to send messages
- [ ] Create \`GET /api/v1/portal/messages\` endpoint for message history
- [ ] Create \`POST /api/v1/patients/:id/messages\` endpoint for staff to reply
- [ ] Add real-time notifications via Socket.IO for new messages
- [ ] Add email notifications for new messages
- [ ] Add message threading support
- [ ] Write tests for the messaging system

## Acceptance Criteria

- Patients can send secure messages to their care team
- Staff can reply to patient messages
- Real-time notifications are sent for new messages
- Message history is paginated and searchable
- Tests cover message sending, receiving, and notifications"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add automated dependency update workflow with security scanning" \
  --label "enhancement,security,devops" \
  --body "## Description

The \`.github/dependabot.yml\` configures Dependabot for automated dependency updates. However, the CI pipeline does not include a step to automatically run security scans on dependency updates before merging. The \`npm audit\` step in CI only runs on the main branch, not on Dependabot PRs.

**Why it matters in production:** Outdated dependencies with known vulnerabilities are a common attack vector. Automated updates with security scanning ensure vulnerabilities are patched quickly.

## Tasks

- [ ] Update \`.github/dependabot.yml\` to group minor/patch updates
- [ ] Add a \`security-scan\` job that runs on all Dependabot PRs
- [ ] Configure Snyk to automatically comment on PRs with vulnerability details
- [ ] Add \`npm audit --audit-level=critical\` as a required CI check
- [ ] Add license compatibility checking for new dependencies
- [ ] Configure auto-merge for patch updates that pass all checks
- [ ] Add a weekly dependency audit report
- [ ] Update \`CONTRIBUTING.md\` with dependency update guidelines

## Acceptance Criteria

- Dependabot creates PRs for all dependency updates
- Security scan runs automatically on Dependabot PRs
- Critical vulnerabilities block PR merging
- Patch updates are auto-merged if all checks pass
- Weekly audit report is generated"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add multi-clinic support for SUPER_ADMIN users" \
  --label "enhancement,user-management,admin" \
  --body "## Description

The current authentication system in \`apps/api/src/modules/auth/auth.controller.ts\` assigns each user to a single \`clinicId\`. SUPER_ADMIN users can manage all clinics but are still scoped to a single clinic in their JWT token. This means SUPER_ADMIN users cannot easily switch between clinics without logging out and back in.

**Why it matters in production:** Platform administrators need to be able to manage multiple clinics efficiently. The current single-clinic scoping creates friction for multi-clinic management.

## Tasks

- [ ] Add a \`POST /api/v1/auth/switch-clinic\` endpoint for SUPER_ADMIN users
- [ ] Issue a new access token scoped to the selected clinic
- [ ] Add a \`GET /api/v1/clinics\` endpoint listing all clinics for SUPER_ADMIN
- [ ] Add a clinic switcher UI component in the frontend
- [ ] Add audit logging for clinic switches
- [ ] Update the JWT payload to include the \`isSuperAdmin\` flag
- [ ] Write tests for clinic switching
- [ ] Update Swagger docs

## Acceptance Criteria

- SUPER_ADMIN users can switch between clinics without re-logging in
- New access token is issued for the selected clinic
- Clinic switch is recorded in the audit log
- Frontend shows a clinic switcher for SUPER_ADMIN users
- Tests verify clinic switching behavior"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add HIPAA-compliant data export for patients (right of access)" \
  --label "enhancement,compliance,hipaa" \
  --body "## Description

The \`.changeset/feat-hipaa-data-export.md\` indicates a HIPAA data export feature is in progress. HIPAA's Right of Access provision requires covered entities to provide patients with their health records within 30 days of request. The current export module (\`apps/api/src/modules/export/\`) may not include a patient-facing export that covers all required data elements.

**Why it matters in production:** Failure to provide patients with their records within 30 days is a HIPAA violation subject to significant fines.

## Tasks

- [ ] Create a \`POST /api/v1/portal/export-request\` endpoint for patients to request their data
- [ ] Implement a comprehensive export that includes: demographics, encounters, diagnoses, medications, lab results, immunizations, and billing records
- [ ] Generate the export in multiple formats: PDF, CSV, and FHIR R4
- [ ] Send the export via secure download link (not email attachment)
- [ ] Track export requests in the audit log with timestamps
- [ ] Implement a 30-day SLA tracking system
- [ ] Send email notification when the export is ready
- [ ] Write tests for the export request flow

## Acceptance Criteria

- Patients can request their complete health record via the portal
- Export includes all required HIPAA data elements
- Export is available in PDF, CSV, and FHIR R4 formats
- Secure download link is sent via email
- Audit log records the export request and fulfillment
- Tests cover the complete export flow"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar payment dispute resolution workflow" \
  --label "enhancement,payments,blockchain" \
  --body "## Description

The \`apps/api/src/modules/payments/dispute.controller.ts\` and \`dispute.controller.test.ts\` implement payment dispute management. The \`.changeset/feat-payment-disputes-refunds.md\` indicates this feature is in progress. However, the dispute resolution workflow may not include all necessary steps: evidence submission, review period, resolution, and refund processing.

**Why it matters in production:** Payment disputes are inevitable in a healthcare payment system. A clear, auditable dispute resolution workflow protects both clinics and patients.

## Tasks

- [ ] Add \`evidence\`, \`evidenceSubmittedAt\`, \`reviewDeadline\`, and \`resolution\` fields to \`payment-dispute.model.ts\`
- [ ] Add a \`POST /api/v1/payments/:id/disputes/:disputeId/evidence\` endpoint
- [ ] Implement a review period (default: 7 days) after evidence submission
- [ ] Add automatic refund processing when a dispute is resolved in the patient's favor
- [ ] Add email notifications at each dispute stage
- [ ] Add dispute status to the payment receipt
- [ ] Write comprehensive tests for the dispute workflow
- [ ] Update Swagger docs

## Acceptance Criteria

- Evidence can be submitted for disputes
- Review period is enforced (7 days)
- Refunds are automatically processed for resolved disputes
- Email notifications are sent at each stage
- Tests cover the complete dispute workflow"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add clinic onboarding wizard for new clinic setup" \
  --label "enhancement,frontend,onboarding" \
  --body "## Description

New clinics joining the platform must manually configure multiple settings: Stellar keypair generation, USDC trustline creation, user creation, clinic settings, and subscription selection. There is no guided onboarding wizard to walk clinic administrators through these steps.

**Why it matters in production:** A complex, undocumented onboarding process leads to misconfigured clinics, support requests, and poor first impressions. A guided wizard reduces setup errors.

## Tasks

- [ ] Create an onboarding wizard component in \`apps/web/src/app/onboarding/\`
- [ ] Step 1: Clinic profile setup (name, address, contact info)
- [ ] Step 2: Stellar keypair generation and USDC trustline creation
- [ ] Step 3: First user creation (doctor/nurse)
- [ ] Step 4: Subscription plan selection
- [ ] Step 5: Notification preferences
- [ ] Add an \`onboardingCompleted\` flag to the \`ClinicModel\`
- [ ] Redirect new clinics to the onboarding wizard on first login
- [ ] Write E2E tests for the onboarding flow

## Acceptance Criteria

- New clinics are redirected to the onboarding wizard on first login
- All 5 onboarding steps are completable via the wizard
- Stellar keypair is generated and trustline created during onboarding
- \`onboardingCompleted\` flag is set after wizard completion
- E2E tests cover the complete onboarding flow"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add real-time patient vital signs monitoring dashboard" \
  --label "enhancement,clinical,realtime" \
  --body "## Description

The \`EncounterModel\` stores vital signs (\`bloodPressure\`, \`heartRate\`, \`temperature\`, etc.) as part of encounter records. However, there is no real-time vital signs monitoring dashboard that shows trends over time for a patient. Clinicians need to see vital sign trends across multiple encounters to identify deteriorating patients.

**Why it matters in production:** Vital sign trends are critical for identifying patients at risk of deterioration. A real-time monitoring dashboard enables proactive intervention.

## Tasks

- [ ] Create a \`GET /api/v1/patients/:id/vitals/history\` endpoint returning vital sign time series
- [ ] Add trend calculation (improving/stable/worsening) for each vital sign
- [ ] Create a vital signs dashboard component in the frontend
- [ ] Add real-time vital sign updates via Socket.IO when new encounters are created
- [ ] Add configurable alert thresholds for abnormal vital signs
- [ ] Emit \`vitals:abnormal\` Socket.IO event when vitals exceed thresholds
- [ ] Add vital sign trends to the patient risk score calculation
- [ ] Write tests for vital sign history and trend calculation

## Acceptance Criteria

- Vital sign history is available via the API
- Trend calculation (improving/stable/worsening) is accurate
- Frontend dashboard shows vital sign trends over time
- Real-time updates are pushed via Socket.IO
- Abnormal vital signs trigger alerts
- Tests cover history retrieval and trend calculation"

echo "Issues 71-80 created successfully"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add comprehensive API rate limiting per user role" \
  --label "security,enhancement,api" \
  --body "## Description

The current rate limiting in \`apps/api/src/middlewares/rate-limit.middleware.ts\` applies limits by IP address for auth endpoints and by clinic ID for AI and payment endpoints. However, there is no per-user rate limiting, and the general limiter (300 req/15min) applies to all endpoints equally regardless of their sensitivity.

High-sensitivity endpoints (patient data export, bulk operations) should have stricter limits than read-only endpoints.

**Why it matters in production:** Without per-endpoint rate limiting, a single user can exhaust the general rate limit with bulk read operations, degrading service for other users.

## Tasks

- [ ] Add per-user rate limiting using \`req.user.userId\` as the key
- [ ] Create endpoint-specific limiters for: bulk export (5/hour), patient search (100/min), report generation (10/hour)
- [ ] Add a \`X-RateLimit-Remaining\` header to all responses
- [ ] Add rate limit metrics to Prometheus
- [ ] Add a rate limit exceeded alert in Grafana
- [ ] Update the frontend to handle 429 responses gracefully
- [ ] Write tests for per-user rate limiting
- [ ] Document rate limits in the API documentation

## Acceptance Criteria

- Per-user rate limits are enforced independently of IP limits
- Bulk export endpoint has a 5/hour limit per user
- \`X-RateLimit-Remaining\` header is included in all responses
- Prometheus tracks rate limit violations by endpoint
- Frontend shows a user-friendly message on rate limit exceeded"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient duplicate detection improvements with fuzzy matching" \
  --label "enhancement,data-quality,clinical" \
  --body "## Description

The \`apps/api/src/modules/patients/duplicate-detection.service.ts\` implements patient duplicate detection. However, the current implementation may use exact matching or simple string comparison, which misses duplicates caused by typos, name variations (e.g., 'John' vs 'Jon'), or different date formats.

**Why it matters in production:** Duplicate patient records lead to fragmented medical histories, incorrect billing, and potential patient safety issues when a clinician views an incomplete record.

## Tasks

- [ ] Implement fuzzy name matching using Levenshtein distance or Jaro-Winkler similarity
- [ ] Add phonetic matching (Soundex or Metaphone) for name comparison
- [ ] Add date of birth fuzzy matching (allow ±1 day for data entry errors)
- [ ] Add phone number normalization before comparison
- [ ] Add a confidence score to duplicate detection results
- [ ] Add a \`GET /api/v1/patients/potential-duplicates\` endpoint
- [ ] Add a bulk duplicate review UI for clinic administrators
- [ ] Write tests for fuzzy matching algorithms

## Acceptance Criteria

- Fuzzy name matching detects 'John Smith' and 'Jon Smyth' as potential duplicates
- Confidence scores are returned with duplicate suggestions
- \`GET /api/v1/patients/potential-duplicates\` returns ranked duplicate pairs
- Bulk review UI allows admins to confirm or dismiss duplicates
- Tests verify fuzzy matching accuracy"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar Horizon failover and multi-endpoint resilience" \
  --label "enhancement,blockchain,reliability" \
  --body "## Description

The \`apps/stellar-service/src/horizon-client.ts\` implements a \`ResilientHorizonClient\` with health checks. However, the failover logic may not handle all failure scenarios: slow responses (not just connection failures), partial failures (some endpoints work, others don't), and circuit breaker patterns.

**Why it matters in production:** Stellar Horizon endpoint outages are not uncommon. Without robust failover, payment processing stops entirely when the primary Horizon endpoint is unavailable.

## Tasks

- [ ] Implement a circuit breaker pattern in \`horizon-client.ts\`
- [ ] Add response time monitoring and failover when response time exceeds a threshold
- [ ] Add a configurable list of Horizon endpoints (primary + fallbacks)
- [ ] Implement weighted round-robin load balancing across healthy endpoints
- [ ] Add Prometheus metrics for Horizon endpoint health and response times
- [ ] Add a Grafana dashboard for Horizon endpoint status
- [ ] Write tests for failover scenarios
- [ ] Document the failover configuration

## Acceptance Criteria

- Circuit breaker opens after 5 consecutive failures
- Failover occurs when response time exceeds 5 seconds
- Multiple Horizon endpoints are supported
- Prometheus tracks endpoint health and response times
- Tests verify failover behavior"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add comprehensive audit log search and filtering" \
  --label "enhancement,compliance,audit" \
  --body "## Description

The \`apps/api/src/modules/audit/audit.controller.ts\` and \`audit-logs.controller.ts\` provide audit log access. However, the search and filtering capabilities may be limited. HIPAA auditors need to be able to search audit logs by user, action type, date range, patient, and outcome.

**Why it matters in production:** During a HIPAA audit or security incident investigation, the ability to quickly search and filter audit logs is critical. Poor search capabilities can delay incident response.

## Tasks

- [ ] Add full-text search to audit logs using MongoDB text index
- [ ] Add filtering by: \`userId\`, \`clinicId\`, \`action\`, \`resourceType\`, \`resourceId\`, \`outcome\`, \`dateFrom\`, \`dateTo\`, \`ipAddress\`
- [ ] Add sorting by timestamp (ascending/descending)
- [ ] Add audit log export to CSV for HIPAA auditors
- [ ] Add a \`GET /api/v1/audit/summary\` endpoint with action counts by type
- [ ] Add pagination with cursor-based navigation for large result sets
- [ ] Write tests for all filter combinations
- [ ] Update Swagger docs

## Acceptance Criteria

- Audit logs can be filtered by all specified fields
- Full-text search works across action and metadata fields
- CSV export is available for HIPAA auditors
- Summary endpoint returns action counts
- Tests cover all filter combinations"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add automated ICD-10 code suggestion based on clinical notes" \
  --label "enhancement,ai,clinical" \
  --body "## Description

The \`apps/api/src/modules/ai/ai.routes.ts\` has various AI endpoints. The \`apps/api/src/modules/icd10/icd10.controller.ts\` handles ICD-10 code lookup. However, there is no AI-powered ICD-10 code suggestion based on clinical notes or chief complaint.

Clinicians currently must manually search for ICD-10 codes. AI-powered suggestions based on the encounter's chief complaint and SOAP notes would significantly speed up coding.

**Why it matters in production:** Manual ICD-10 coding is time-consuming and error-prone. Incorrect codes lead to claim denials and revenue loss.

## Tasks

- [ ] Add a \`POST /api/v1/ai/suggest-icd10\` endpoint
- [ ] Use Gemini to analyze chief complaint and SOAP notes and suggest relevant ICD-10 codes
- [ ] Return top 5 suggestions with confidence scores and reasoning
- [ ] Integrate suggestions into the encounter creation form
- [ ] Add a feedback mechanism (accept/reject suggestions) to improve accuracy
- [ ] Store accepted suggestions to build a training dataset
- [ ] Write tests for the suggestion endpoint
- [ ] Update Swagger docs

## Acceptance Criteria

- ICD-10 suggestions are returned based on clinical notes
- Top 5 suggestions include confidence scores and reasoning
- Suggestions are integrated into the encounter form
- Feedback mechanism records accepted/rejected suggestions
- Tests cover suggestion generation and feedback recording"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add clinic performance benchmarking and peer comparison reports" \
  --label "enhancement,reporting,analytics" \
  --body "## Description

The \`apps/api/src/modules/reports/reports.controller.ts\` generates various reports. However, there are no benchmarking reports that compare a clinic's performance against anonymized peer data (e.g., average encounter duration, patient satisfaction scores, payment collection rates).

**Why it matters in production:** Clinics need to understand how they compare to peers to identify improvement opportunities. Benchmarking is a key feature for value-based care programs.

## Tasks

- [ ] Create a \`GET /api/v1/reports/benchmarks\` endpoint
- [ ] Calculate anonymized aggregate metrics across all clinics
- [ ] Compare individual clinic metrics against the aggregate
- [ ] Include metrics: average encounter duration, payment collection rate, patient satisfaction, appointment no-show rate
- [ ] Add benchmark data to the dashboard
- [ ] Ensure individual clinic data is not identifiable in aggregate metrics
- [ ] Write tests for benchmark calculation
- [ ] Update Swagger docs

## Acceptance Criteria

- Benchmark report compares clinic metrics against anonymized peer data
- Individual clinic data is not identifiable in aggregate metrics
- Benchmark data is shown on the dashboard
- Report includes all specified metrics
- Tests verify benchmark calculation accuracy"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add automated prescription refill request workflow" \
  --label "enhancement,clinical,pharmacy" \
  --body "## Description

The \`EncounterModel\` includes prescriptions with a \`refillsAllowed\` field. However, there is no workflow for patients to request prescription refills via the portal, or for doctors to approve/deny refill requests.

**Why it matters in production:** Prescription refill management is a high-volume clinical workflow. Without an automated system, refill requests are handled via phone calls, creating inefficiency and documentation gaps.

## Tasks

- [ ] Create a \`PrescriptionRefillModel\` with \`prescriptionId\`, \`patientId\`, \`requestedAt\`, \`status\`, \`approvedBy\`, and \`notes\` fields
- [ ] Add \`POST /api/v1/portal/prescriptions/:id/refill-request\` endpoint
- [ ] Add \`GET /api/v1/prescriptions/refill-requests\` endpoint for doctors
- [ ] Add \`PATCH /api/v1/prescriptions/refill-requests/:id\` for approve/deny
- [ ] Emit Socket.IO events for new refill requests and decisions
- [ ] Send email notifications for refill request status changes
- [ ] Decrement \`refillsAllowed\` when a refill is approved
- [ ] Write tests for the refill workflow

## Acceptance Criteria

- Patients can request prescription refills via the portal
- Doctors receive real-time notifications for refill requests
- Refill approval decrements the \`refillsAllowed\` counter
- Email notifications are sent for status changes
- Tests cover the complete refill workflow"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add FHIR-compliant medication administration record (MAR)" \
  --label "enhancement,clinical,compliance" \
  --body "## Description

The \`EncounterModel\` includes prescriptions but there is no Medication Administration Record (MAR) — a log of when medications were actually administered to patients (as opposed to prescribed). MARs are required for inpatient and observation care settings.

**Why it matters in production:** Without a MAR, there is no record of medication administration, which is a patient safety and regulatory compliance gap for facilities providing direct patient care.

## Tasks

- [ ] Create a \`MedicationAdministrationModel\` with \`prescriptionId\`, \`patientId\`, \`administeredBy\`, \`administeredAt\`, \`dose\`, \`route\`, and \`notes\` fields
- [ ] Create \`POST /api/v1/encounters/:id/medications/:prescriptionId/administer\` endpoint
- [ ] Create \`GET /api/v1/patients/:id/mar\` endpoint for the full MAR
- [ ] Add MAR to the encounter view
- [ ] Add \`MEDICATION_ADMINISTERED\` to the \`AuditAction\` enum
- [ ] Map MAR records to FHIR R4 \`MedicationAdministration\` resources
- [ ] Write tests for MAR recording and retrieval
- [ ] Update Swagger docs

## Acceptance Criteria

- Medication administrations can be recorded via the API
- Full MAR is available per patient
- MAR records are included in FHIR R4 exports
- Audit log records all medication administrations
- Tests cover MAR recording and retrieval"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add clinic-level two-factor authentication enforcement policy" \
  --label "security,enhancement,admin" \
  --body "## Description

Currently, MFA enforcement is hardcoded in \`apps/api/src/modules/auth/auth.controller.ts\` for specific roles. Clinic administrators should be able to set their own MFA policy (e.g., require MFA for all users, only for specific roles, or make it optional).

**Why it matters in production:** Different clinics have different security requirements. A large hospital system may require MFA for all staff, while a small private practice may only require it for admins.

## Tasks

- [ ] Add \`mfaPolicy\` field to \`clinic-settings.model.ts\`: \`{ required: boolean, requiredRoles: string[], gracePeriodDays: number }\`
- [ ] Update the auth controller to check the clinic's MFA policy instead of the hardcoded set
- [ ] Add a \`GET /api/v1/settings/mfa-policy\` endpoint
- [ ] Add a \`PUT /api/v1/settings/mfa-policy\` endpoint (CLINIC_ADMIN only)
- [ ] Add MFA policy configuration to the clinic settings UI
- [ ] Send email notifications to affected users when the policy changes
- [ ] Write tests for policy enforcement
- [ ] Update Swagger docs

## Acceptance Criteria

- Clinic admins can configure MFA requirements per role
- MFA policy is enforced at login time
- Policy changes trigger email notifications to affected users
- Tests verify policy enforcement for each configuration
- Swagger docs describe the MFA policy endpoints"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient satisfaction survey analytics and reporting" \
  --label "enhancement,clinical,reporting" \
  --body "## Description

The \`apps/api/src/modules/surveys/surveys.controller.ts\` and \`survey.model.ts\` implement patient satisfaction surveys triggered after encounters. However, there is no analytics or reporting on survey responses. Clinic administrators need to see satisfaction trends, identify low-scoring encounters, and track improvement over time.

**Why it matters in production:** Patient satisfaction is a key quality metric and is increasingly tied to reimbursement in value-based care models. Without analytics, survey data is collected but not actionable.

## Tasks

- [ ] Add a \`GET /api/v1/surveys/analytics\` endpoint with satisfaction scores by doctor, encounter type, and time period
- [ ] Add a \`GET /api/v1/surveys/responses\` endpoint for individual survey responses
- [ ] Calculate Net Promoter Score (NPS) from survey data
- [ ] Add satisfaction trends to the dashboard
- [ ] Add a low-satisfaction alert (notify clinic admin when score drops below threshold)
- [ ] Add survey response export to CSV
- [ ] Write tests for analytics calculation
- [ ] Update Swagger docs

## Acceptance Criteria

- Analytics endpoint returns satisfaction scores by doctor and encounter type
- NPS is calculated from survey data
- Dashboard shows satisfaction trends
- Low-satisfaction alert fires when score drops below threshold
- Tests verify analytics calculation accuracy"

echo "Issues 81-90 created successfully"
