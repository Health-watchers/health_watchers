#!/usr/bin/env bash
set -e
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add CPT code billing integration with insurance claim generation" \
  --label "enhancement,billing,compliance" \
  --body "## Description

The \`EncounterModel\` includes a \`billing\` field with \`cptCodes\` and \`billingStatus\`. The \`apps/api/src/modules/cpt/\` directory has CPT code management. The \`apps/api/src/modules/encounters/billing.controller.ts\` handles billing. However, there is no integration with insurance claim generation systems (e.g., generating CMS-1500 forms or EDI 837 transactions).

**Why it matters in production:** Without insurance claim generation, clinics must manually create claims in separate billing software, duplicating data entry and increasing errors.

## Tasks

- [ ] Add a \`POST /api/v1/encounters/:id/billing/generate-claim\` endpoint
- [ ] Generate CMS-1500 form data from encounter billing information
- [ ] Add EDI 837 transaction generation for electronic claim submission
- [ ] Add claim status tracking (\`submitted\`, \`accepted\`, \`rejected\`, \`paid\`)
- [ ] Add a \`GET /api/v1/billing/claims\` endpoint for claim management
- [ ] Add claim rejection reason tracking and resubmission workflow
- [ ] Write tests for claim generation
- [ ] Update Swagger docs

## Acceptance Criteria

- CMS-1500 form data is generated from encounter billing
- EDI 837 transactions can be generated for electronic submission
- Claim status is tracked through the billing lifecycle
- Rejected claims can be corrected and resubmitted
- Tests cover claim generation and status tracking"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient portal medication history and refill tracking" \
  --label "enhancement,portal,pharmacy" \
  --body "## Description

The patient portal allows patients to view their records, but medication history (all prescriptions across all encounters) may not be presented in a unified, easy-to-understand format. Patients need to see their current medications, past medications, and refill history in one place.

**Why it matters in production:** Patients who cannot easily access their medication history may take incorrect doses, miss refills, or fail to inform other providers of their medications.

## Tasks

- [ ] Add a \`GET /api/v1/portal/medications\` endpoint returning all prescriptions across encounters
- [ ] Add filtering by: active/inactive, date range, prescribing doctor
- [ ] Add a \`GET /api/v1/portal/medications/:prescriptionId/refill-history\` endpoint
- [ ] Create a medication history page in the patient portal
- [ ] Add medication interaction warnings visible to patients
- [ ] Add a medication reminder feature (push notifications)
- [ ] Write tests for the medication history endpoint
- [ ] Update Swagger docs

## Acceptance Criteria

- Patients can view all their medications in one place
- Medications are filterable by status and date
- Refill history is accessible per prescription
- Medication interaction warnings are shown to patients
- Tests cover medication history retrieval and filtering"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar payment receipt PDF generation with QR code" \
  --label "enhancement,payments,documents" \
  --body "## Description

The \`apps/api/src/modules/payments/services/receipt.service.ts\` generates payment receipts. However, the receipt may not include a QR code linking to the Stellar transaction on the blockchain explorer, or a PDF version suitable for patient records.

**Why it matters in production:** Patients need a verifiable receipt for their healthcare payments. A PDF receipt with a blockchain verification QR code provides transparency and trust.

## Tasks

- [ ] Update \`receipt.service.ts\` to generate PDF receipts using the existing PDF generation infrastructure
- [ ] Include a QR code linking to the Stellar transaction on Stellar Expert or Horizon
- [ ] Include clinic branding (logo, address) in the receipt
- [ ] Add a \`GET /api/v1/payments/:id/receipt/pdf\` endpoint
- [ ] Store the receipt PDF URL in \`PaymentRecordModel.receiptUrl\`
- [ ] Send the receipt PDF via email after payment confirmation
- [ ] Write tests for PDF receipt generation
- [ ] Update Swagger docs

## Acceptance Criteria

- Payment receipts are generated as PDFs
- PDF includes a QR code linking to the Stellar transaction
- PDF includes clinic branding
- Receipt is emailed after payment confirmation
- Tests verify PDF generation and QR code inclusion"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add multi-factor authentication backup code regeneration" \
  --label "security,enhancement,authentication" \
  --body "## Description

The \`apps/api/src/modules/auth/auth.controller.ts\` generates 10 backup codes when MFA is enabled. However, there is no endpoint to regenerate backup codes when they are running low or have been used. Users who have used all their backup codes and lost their authenticator device are permanently locked out.

**Why it matters in production:** Account lockout due to lost MFA devices is a support burden and can prevent clinicians from accessing patient data in emergencies.

## Tasks

- [ ] Add a \`POST /api/v1/auth/mfa/backup-codes/regenerate\` endpoint
- [ ] Require current password and TOTP code (or existing backup code) to regenerate
- [ ] Invalidate all existing backup codes when new ones are generated
- [ ] Add a \`GET /api/v1/auth/mfa/backup-codes/count\` endpoint showing remaining codes
- [ ] Send an email notification when backup codes are regenerated
- [ ] Add a warning in the UI when fewer than 3 backup codes remain
- [ ] Write tests for backup code regeneration
- [ ] Update Swagger docs

## Acceptance Criteria

- Backup codes can be regenerated via the API
- Regeneration requires authentication (password + TOTP or existing backup code)
- Old backup codes are invalidated on regeneration
- Email notification is sent on regeneration
- UI warns when fewer than 3 backup codes remain"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add encounter billing status workflow with insurance integration" \
  --label "enhancement,billing,clinical" \
  --body "## Description

The \`EncounterModel\` has a \`billing.billingStatus\` field with values \`unbilled\`, \`billed\`, \`paid\`, \`denied\`. The \`apps/api/src/modules/encounters/billing.controller.ts\` manages billing. However, the billing status workflow may not include all necessary transitions and notifications.

**Why it matters in production:** Billing status management is critical for clinic revenue. Encounters stuck in \`unbilled\` status represent uncollected revenue.

## Tasks

- [ ] Add a billing status workflow with valid transitions: \`unbilled → billed → paid/denied → resubmitted\`
- [ ] Add a \`GET /api/v1/billing/unbilled\` endpoint for encounters awaiting billing
- [ ] Add a \`GET /api/v1/billing/denied\` endpoint for denied claims
- [ ] Add email notifications to billing staff when encounters are ready for billing
- [ ] Add a billing aging report (encounters unbilled for > 30/60/90 days)
- [ ] Add billing status to the encounter list view
- [ ] Write tests for billing status transitions
- [ ] Update Swagger docs

## Acceptance Criteria

- Billing status transitions follow the defined workflow
- Invalid transitions return 400 with a clear error message
- Billing staff receive notifications for unbilled encounters
- Aging report shows encounters by days unbilled
- Tests cover all valid and invalid status transitions"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar DEX trading integration for XLM/USDC conversion" \
  --label "enhancement,blockchain,payments" \
  --body "## Description

The \`apps/api/src/modules/payments/payments.controller.ts\` has a \`GET /payments/stellar/orderbook\` endpoint using \`stellarClient.getOrderbook\`. However, there is no UI or workflow for clinics to convert their XLM balance to USDC (or vice versa) using the Stellar DEX.

**Why it matters in production:** Clinics may receive payments in XLM but prefer to hold USDC for stability. Without a DEX integration, they must use external exchanges to convert, adding friction and fees.

## Tasks

- [ ] Add a \`POST /api/v1/payments/stellar/trade\` endpoint for DEX trades
- [ ] Implement offer creation in \`apps/stellar-service/src/stellar.ts\`
- [ ] Add a DEX trading UI in the wallet section of the frontend
- [ ] Show current orderbook and estimated trade price
- [ ] Add trade history tracking in \`PaymentRecordModel\`
- [ ] Add trade confirmation with slippage protection
- [ ] Write tests for DEX trade execution
- [ ] Update Swagger docs

## Acceptance Criteria

- Clinics can trade XLM for USDC via the Stellar DEX
- Orderbook is displayed in the trading UI
- Slippage protection prevents unfavorable trades
- Trade history is tracked in payment records
- Tests cover trade execution and slippage protection"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add comprehensive input validation for all API endpoints using Zod" \
  --label "security,enhancement,api" \
  --body "## Description

The API uses Zod for request validation via the \`validateRequest\` middleware. However, not all endpoints may have comprehensive Zod schemas. Some endpoints may accept arbitrary objects or have loose validation that allows unexpected fields.

**Why it matters in production:** Insufficient input validation is a common source of security vulnerabilities and data integrity issues. Strict validation prevents injection attacks and unexpected data.

## Tasks

- [ ] Audit all API endpoints for missing or incomplete Zod validation schemas
- [ ] Add \`strict()\` to all Zod object schemas to reject unknown fields
- [ ] Add string length limits to all string fields
- [ ] Add numeric range validation to all numeric fields
- [ ] Add enum validation for all status/type fields
- [ ] Add custom validators for Stellar public keys, ICD-10 codes, and MongoDB ObjectIDs
- [ ] Write tests for validation rejection of invalid inputs
- [ ] Update Swagger docs to reflect validation constraints

## Acceptance Criteria

- All endpoints have Zod validation schemas
- Unknown fields are rejected with 400
- String length limits are enforced
- Custom validators work for domain-specific fields
- Tests verify validation rejection for each endpoint"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient portal two-way document sharing" \
  --label "enhancement,portal,documents" \
  --body "## Description

The patient portal allows patients to view their records. However, patients cannot upload documents (e.g., records from other providers, insurance cards, ID documents) to share with their care team. Two-way document sharing is a key feature of modern patient portals.

**Why it matters in production:** Patients often need to share documents from other providers. Without upload capability, they must bring physical documents to appointments.

## Tasks

- [ ] Add a \`POST /api/v1/portal/documents\` endpoint for patient document uploads
- [ ] Add a \`GET /api/v1/portal/documents\` endpoint for listing uploaded documents
- [ ] Add file type validation (PDF, JPEG, PNG) and size limits (10MB)
- [ ] Notify the care team when a patient uploads a document
- [ ] Add document categorization (insurance card, referral letter, lab result, etc.)
- [ ] Add document sharing controls (patient can choose who can see each document)
- [ ] Write tests for document upload and retrieval
- [ ] Update Swagger docs

## Acceptance Criteria

- Patients can upload documents via the portal
- Care team is notified of new patient uploads
- File type and size validation is enforced
- Documents can be categorized
- Tests cover upload, retrieval, and notification"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add automated performance regression testing" \
  --label "enhancement,testing,performance" \
  --body "## Description

The CI pipeline does not include performance regression testing. API response times could degrade over time as new features are added without detection. A performance baseline should be established and regressions should fail CI.

**Why it matters in production:** Performance regressions discovered in production affect all users. Catching them in CI prevents degraded user experience from reaching production.

## Tasks

- [ ] Add k6 or Artillery load testing scripts for key endpoints
- [ ] Define performance baselines: patient list < 200ms, encounter creation < 500ms, payment intent < 1s
- [ ] Add a performance test job to CI that runs on PRs
- [ ] Fail CI if response times exceed baselines by more than 20%
- [ ] Add performance test results as PR comments
- [ ] Track performance trends over time in Grafana
- [ ] Write performance tests for the 10 most critical endpoints
- [ ] Document performance requirements in \`CONTRIBUTING.md\`

## Acceptance Criteria

- Performance tests run on every PR
- CI fails if response times exceed baselines by 20%
- Performance test results are posted as PR comments
- Performance trends are tracked in Grafana
- 10 critical endpoints have performance baselines"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar payment streaming for real-time transaction monitoring" \
  --label "enhancement,blockchain,realtime" \
  --body "## Description

The \`apps/stellar-service/src/payment-stream.ts\` implements Stellar payment streaming. However, the streaming may not be fully integrated with the payment confirmation flow in the API. When a patient makes a Stellar payment, the API should automatically detect and confirm it via the payment stream rather than requiring manual polling.

**Why it matters in production:** Manual payment confirmation polling creates delays and requires user action. Automatic detection via streaming provides instant payment confirmation.

## Tasks

- [ ] Ensure \`payment-stream.ts\` is started when the stellar-service starts
- [ ] Implement automatic payment matching: match incoming Stellar transactions to pending payment intents by memo
- [ ] Emit a \`payment:confirmed\` event to the API when a matching transaction is detected
- [ ] Update the payment record status automatically on confirmation
- [ ] Add a reconnection strategy for stream disconnections
- [ ] Add Prometheus metrics for stream health and confirmed payments
- [ ] Write tests for payment stream matching
- [ ] Update Swagger docs for the payment confirmation flow

## Acceptance Criteria

- Incoming Stellar payments are automatically matched to pending intents
- Payment status is updated automatically without user action
- Stream reconnects automatically after disconnection
- Prometheus tracks stream health
- Tests verify payment matching logic"

echo "Issues 121-130 created successfully"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add clinic staff scheduling and shift management" \
  --label "enhancement,clinical,scheduling" \
  --body "## Description

The \`apps/api/src/modules/schedules/\` directory implements scheduling. However, the scheduling module may focus on patient appointments rather than staff scheduling (which doctors/nurses are working on which days). Clinic administrators need to manage staff schedules to ensure adequate coverage.

**Why it matters in production:** Without staff scheduling, clinics cannot ensure adequate coverage or prevent appointment booking when a doctor is unavailable.

## Tasks

- [ ] Add a \`StaffScheduleModel\` with \`userId\`, \`clinicId\`, \`date\`, \`startTime\`, \`endTime\`, \`isAvailable\` fields
- [ ] Add \`POST /api/v1/schedules/staff\` endpoint for creating staff schedules
- [ ] Add \`GET /api/v1/schedules/staff\` endpoint for viewing staff availability
- [ ] Integrate staff availability with appointment booking (prevent booking when doctor is unavailable)
- [ ] Add recurring schedule support (e.g., every Monday 9am-5pm)
- [ ] Add schedule conflict detection
- [ ] Write tests for staff scheduling
- [ ] Update Swagger docs

## Acceptance Criteria

- Staff schedules can be created and managed via the API
- Appointment booking respects staff availability
- Recurring schedules are supported
- Schedule conflicts are detected and reported
- Tests cover schedule creation, conflict detection, and availability checking"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add HIPAA breach notification workflow" \
  --label "enhancement,compliance,hipaa" \
  --body "## Description

HIPAA requires covered entities to notify affected individuals, HHS, and in some cases the media within specific timeframes when a breach of unsecured PHI occurs. There is no breach notification workflow in the current system.

**Why it matters in production:** Failure to notify affected individuals within 60 days of discovering a breach is a HIPAA violation subject to significant fines.

## Tasks

- [ ] Create a \`BreachIncidentModel\` with \`discoveredAt\`, \`affectedPatients\`, \`description\`, \`severity\`, \`notificationStatus\`, and \`notificationDeadline\` fields
- [ ] Add a \`POST /api/v1/admin/breach-incidents\` endpoint (SUPER_ADMIN only)
- [ ] Implement a 60-day notification deadline tracker
- [ ] Add automated email notifications to affected patients
- [ ] Add HHS notification report generation
- [ ] Add a breach incident dashboard for SUPER_ADMIN
- [ ] Write tests for breach incident management
- [ ] Document the breach notification procedure in \`SECURITY.md\`

## Acceptance Criteria

- Breach incidents can be recorded via the API
- 60-day notification deadline is tracked and alerted
- Affected patients receive email notifications
- HHS notification report is generated
- Tests cover breach incident creation and notification tracking"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar payment fee optimization — automatic fee strategy selection" \
  --label "enhancement,blockchain,payments" \
  --body "## Description

The \`PaymentRecordModel\` has a \`feeStrategy\` field (\`slow\`, \`standard\`, \`fast\`). The \`apps/api/src/modules/payments/payments.controller.ts\` allows specifying a fee strategy. However, there is no automatic fee optimization that selects the best strategy based on current network conditions and payment urgency.

**Why it matters in production:** Overpaying fees wastes clinic funds. Underpaying fees causes transactions to be stuck in the mempool. Automatic optimization balances cost and speed.

## Tasks

- [ ] Implement automatic fee strategy selection based on: payment amount (high-value → fast), time of day (off-peak → slow), network congestion (high congestion → fast)
- [ ] Add a \`feeOptimization\` field to clinic settings
- [ ] Update the payment intent creation to use automatic fee selection when no strategy is specified
- [ ] Add fee strategy analytics to the payment dashboard
- [ ] Add a Prometheus metric for fee amounts paid
- [ ] Write tests for fee strategy selection logic
- [ ] Update Swagger docs

## Acceptance Criteria

- Fee strategy is automatically selected based on network conditions
- Clinic settings allow configuring fee optimization preferences
- Fee analytics are available in the dashboard
- Prometheus tracks fee amounts
- Tests verify fee strategy selection logic"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient health goals and wellness tracking" \
  --label "enhancement,clinical,wellness" \
  --body "## Description

The care plan module manages clinical care plans. However, there is no patient-facing wellness tracking feature where patients can log their own health metrics (weight, blood pressure, blood glucose, exercise) between appointments. This data could be used to supplement clinical observations.

**Why it matters in production:** Patient-reported outcomes and self-monitoring data improve care quality and patient engagement. Clinicians can see trends between appointments.

## Tasks

- [ ] Create a \`PatientHealthLogModel\` with \`patientId\`, \`metricType\`, \`value\`, \`unit\`, \`loggedAt\`, and \`notes\` fields
- [ ] Add \`POST /api/v1/portal/health-log\` endpoint for patients to log metrics
- [ ] Add \`GET /api/v1/portal/health-log\` endpoint for viewing history
- [ ] Add \`GET /api/v1/patients/:id/health-log\` endpoint for clinicians
- [ ] Add trend visualization in the patient portal
- [ ] Add alerts when patient-reported metrics exceed thresholds
- [ ] Write tests for health log CRUD operations
- [ ] Update Swagger docs

## Acceptance Criteria

- Patients can log health metrics via the portal
- Clinicians can view patient-reported metrics
- Trend visualization is available in the portal
- Alerts fire when metrics exceed thresholds
- Tests cover health log CRUD operations"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add comprehensive API documentation with Postman collection" \
  --label "documentation,api,developer-experience" \
  --body "## Description

The API has Swagger/OpenAPI documentation via \`setupSwagger\` in \`app.ts\`. However, there is no Postman collection that developers can import to quickly test the API. A Postman collection with pre-configured authentication, environment variables, and example requests would significantly improve the developer experience.

**Why it matters in production:** New developers and integration partners need a quick way to explore and test the API. A Postman collection reduces onboarding time.

## Tasks

- [ ] Generate a Postman collection from the OpenAPI spec
- [ ] Add pre-request scripts for automatic JWT token management
- [ ] Add environment variables for API URL, credentials, and test data
- [ ] Add example requests for all major workflows: auth, patient management, encounters, payments
- [ ] Add test scripts that verify response shapes
- [ ] Publish the collection to Postman's public workspace
- [ ] Add a link to the Postman collection in \`README.md\`
- [ ] Keep the collection in sync with the OpenAPI spec via CI

## Acceptance Criteria

- Postman collection covers all major API workflows
- JWT token management is automated in the collection
- Collection is published to Postman's public workspace
- CI keeps the collection in sync with the OpenAPI spec
- \`README.md\` links to the Postman collection"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar account monitoring for unrecognized transactions" \
  --label "security,blockchain,monitoring" \
  --body "## Description

The \`UserModel\` has a \`preferences.notificationTypes.unrecognized_transaction\` field, indicating that unrecognized transaction alerts are planned. The \`balance-monitoring-job.ts\` monitors balances. However, there may be no mechanism to detect and alert on transactions that don't match any known payment intent.

**Why it matters in production:** Unrecognized transactions could indicate unauthorized access to a clinic's Stellar account. Early detection is critical for minimizing financial losses.

## Tasks

- [ ] Add transaction monitoring to \`balance-monitoring-job.ts\`
- [ ] Compare incoming transactions against known payment intents
- [ ] Flag transactions that don't match any payment intent as unrecognized
- [ ] Send email and in-app notifications for unrecognized transactions
- [ ] Emit \`payment:unrecognized_transaction\` Socket.IO event
- [ ] Add an \`UnrecognizedTransactionModel\` for tracking
- [ ] Add a \`GET /api/v1/payments/unrecognized\` endpoint
- [ ] Write tests for unrecognized transaction detection

## Acceptance Criteria

- Unrecognized transactions are detected and flagged
- Email and in-app notifications are sent for unrecognized transactions
- Socket.IO event is emitted
- Unrecognized transactions are stored for review
- Tests verify detection logic"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient portal appointment history and encounter summary" \
  --label "enhancement,portal,clinical" \
  --body "## Description

The patient portal allows patients to view their records. However, patients may not have access to a clear summary of their past appointments and encounters in a patient-friendly format. Clinical notes in SOAP format are not easily understood by patients.

**Why it matters in production:** Patients who understand their health history are more engaged in their care. Patient-friendly summaries improve health literacy and adherence.

## Tasks

- [ ] Add a \`GET /api/v1/portal/encounters\` endpoint returning patient-friendly encounter summaries
- [ ] Use AI to generate patient-friendly summaries from clinical SOAP notes
- [ ] Add a \`GET /api/v1/portal/appointments/history\` endpoint
- [ ] Create an encounter history page in the patient portal
- [ ] Add the ability for patients to add notes/questions to their encounter records
- [ ] Add encounter summary to the patient portal email notifications
- [ ] Write tests for patient-friendly summary generation
- [ ] Update Swagger docs

## Acceptance Criteria

- Patients can view their encounter history in patient-friendly language
- AI-generated summaries are available for each encounter
- Patients can add notes to their encounter records
- Encounter history is paginated
- Tests cover summary generation and patient note addition"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Kubernetes pod disruption budgets for zero-downtime deployments" \
  --label "enhancement,infrastructure,reliability" \
  --body "## Description

The \`k8s/\` directory contains deployment manifests but no PodDisruptionBudget (PDB) resources. Without PDBs, Kubernetes node maintenance or cluster upgrades could take down all replicas of a service simultaneously, causing downtime.

**Why it matters in production:** Healthcare applications must maintain high availability. Unplanned downtime during cluster maintenance is unacceptable.

## Tasks

- [ ] Create \`k8s/api/pdb.yaml\` with \`minAvailable: 1\` for the API
- [ ] Create \`k8s/web/pdb.yaml\` with \`minAvailable: 1\` for the web frontend
- [ ] Create \`k8s/stellar-service/pdb.yaml\` with \`minAvailable: 1\` for the stellar-service
- [ ] Update Helm chart to include PDB templates
- [ ] Add PDB configuration to \`values.yaml\`
- [ ] Test PDB behavior during simulated node drain
- [ ] Document PDB configuration in \`k8s/README.md\`
- [ ] Add PDB validation to CI

## Acceptance Criteria

- PDBs are defined for all services
- At least 1 replica remains available during node maintenance
- PDBs are included in the Helm chart
- PDB behavior is tested during simulated node drain
- \`k8s/README.md\` documents PDB configuration"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add comprehensive test coverage for the auth module" \
  --label "testing,security,authentication" \
  --body "## Description

The \`apps/api/src/modules/auth/\` directory has several test files (\`auth.routes.test.ts\`, \`token.service.test.ts\`, \`refresh-token-rotation.test.ts\`, \`password-reset.test.ts\`, \`change-password.test.ts\`, \`user-registration.test.ts\`). However, there may be gaps in coverage for: MFA backup code usage, account lockout behavior, concurrent login attempts, and token family invalidation on reuse detection.

**Why it matters in production:** Authentication is the most security-critical module. Gaps in test coverage can hide vulnerabilities that are exploited in production.

## Tasks

- [ ] Add tests for MFA backup code usage and exhaustion
- [ ] Add tests for account lockout after 5 failed attempts
- [ ] Add tests for lockout expiration after 15 minutes
- [ ] Add tests for refresh token family invalidation on reuse detection
- [ ] Add tests for concurrent login attempts (race conditions)
- [ ] Add tests for the MFA grace period for DOCTOR/NURSE roles
- [ ] Achieve 95%+ code coverage for the auth module
- [ ] Add property-based tests for token generation

## Acceptance Criteria

- Auth module has 95%+ code coverage
- All security-critical paths are tested
- Race condition tests verify concurrent login behavior
- Token family invalidation is tested
- Property-based tests verify token generation"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar payment analytics dashboard with revenue trends" \
  --label "enhancement,blockchain,analytics" \
  --body "## Description

The \`apps/api/src/modules/payments/services/analytics.service.ts\` implements payment analytics. However, there may be no frontend dashboard that visualizes Stellar payment data: payment volume over time, success rates, fee costs, asset distribution (XLM vs USDC), and geographic distribution.

**Why it matters in production:** Payment analytics help clinic administrators understand their revenue streams and optimize payment processing.

## Tasks

- [ ] Create a payment analytics dashboard in the frontend
- [ ] Add charts for: daily/weekly/monthly payment volume, success rate trend, fee cost trend, asset distribution
- [ ] Add a \`GET /api/v1/payments/analytics\` endpoint with aggregated data
- [ ] Add date range filtering to the analytics endpoint
- [ ] Add clinic comparison (for SUPER_ADMIN)
- [ ] Export analytics data to CSV
- [ ] Write tests for analytics calculation
- [ ] Update Swagger docs

## Acceptance Criteria

- Payment analytics dashboard shows all specified charts
- Date range filtering works correctly
- SUPER_ADMIN can compare analytics across clinics
- Analytics data can be exported to CSV
- Tests verify analytics calculation accuracy"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add automated dependency license compliance checking" \
  --label "enhancement,compliance,ci-cd" \
  --body "## Description

The CI pipeline has a license check step that uses \`license-checker\` with \`continue-on-error: true\`, meaning license violations don't fail the build. In a commercial healthcare application, using dependencies with incompatible licenses (e.g., GPL) could create legal liability.

**Why it matters in production:** GPL-licensed dependencies in a commercial application can require open-sourcing the entire codebase. This is a significant legal risk.

## Tasks

- [ ] Remove \`continue-on-error: true\` from the license check step in \`ci.yml\`
- [ ] Define an approved license list: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD
- [ ] Add a \`license-checker\` configuration file \`.license-checker.json\`
- [ ] Add exceptions for specific packages with known acceptable licenses
- [ ] Add a pre-commit hook that checks licenses of newly added dependencies
- [ ] Generate a license report as a CI artifact
- [ ] Document the license policy in \`CONTRIBUTING.md\`
- [ ] Review and document all current dependency licenses

## Acceptance Criteria

- License check fails CI if an incompatible license is detected
- Approved license list is documented
- Pre-commit hook prevents adding incompatible dependencies
- License report is generated as a CI artifact
- All current dependencies have documented, approved licenses"

echo "Issues 131-150 created successfully"
