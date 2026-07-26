#!/usr/bin/env bash
set -e
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Kubernetes horizontal pod autoscaling for stellar-service" \
  --label "enhancement,infrastructure,scalability" \
  --body "## Description

The \`k8s/api/hpa.yaml\` configures Horizontal Pod Autoscaling (HPA) for the API service. However, there is no HPA configuration for the stellar-service (\`k8s/stellar-service/deployment.yaml\`). During high payment volume periods, the stellar-service may become a bottleneck.

**Why it matters in production:** Without autoscaling, the stellar-service cannot handle payment volume spikes, causing payment processing delays during peak periods.

## Tasks

- [ ] Create \`k8s/stellar-service/hpa.yaml\` with CPU and memory-based scaling
- [ ] Add custom metrics scaling based on payment queue depth
- [ ] Configure minimum replicas (2) and maximum replicas (10)
- [ ] Add Prometheus custom metrics for the HPA
- [ ] Update Helm chart to include stellar-service HPA
- [ ] Add load testing to verify autoscaling behavior
- [ ] Document scaling configuration in \`k8s/README.md\`
- [ ] Add a Grafana dashboard for stellar-service scaling metrics

## Acceptance Criteria

- Stellar-service scales up when CPU exceeds 70%
- Stellar-service scales up when payment queue depth exceeds threshold
- Minimum 2 replicas are always running
- HPA is included in the Helm chart
- Load test verifies autoscaling behavior"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient allergy cross-reference with prescription drugs" \
  --label "enhancement,clinical,safety" \
  --body "## Description

The \`PatientModel\` includes an \`allergies\` array with allergen, type, and severity. The \`EncounterModel\` includes prescriptions. However, when a prescription is added, there is no automatic check against the patient's known allergies. The \`allergyOverride\` field in the \`Prescription\` interface suggests this was planned but may not be implemented.

**Why it matters in production:** Prescribing a drug to a patient with a known allergy is a serious patient safety event. Automatic allergy checking is a fundamental clinical safety feature.

## Tasks

- [ ] Implement allergy cross-reference checking in \`encounters.controller.ts\` when prescriptions are added
- [ ] Check drug allergies against the patient's \`allergies\` array
- [ ] Return a warning (not a hard block) when an allergy conflict is detected
- [ ] Require an \`allergyOverride.reason\` when prescribing despite a known allergy
- [ ] Add \`ALLERGY_OVERRIDE\` audit logging (already in \`AuditAction\` enum)
- [ ] Emit a \`prescription:allergy_warning\` Socket.IO event to the doctor
- [ ] Write tests for allergy cross-reference checking
- [ ] Update Swagger docs

## Acceptance Criteria

- Prescribing a drug with a known allergy returns a warning
- Override requires a documented reason
- Allergy overrides are recorded in the audit log
- Socket.IO event is emitted for allergy warnings
- Tests cover allergy detection and override flow"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar XLM/USDC exchange rate caching and historical tracking" \
  --label "enhancement,blockchain,payments" \
  --body "## Description

The \`apps/api/src/modules/payments/models/xlm-rate.model.ts\` exists for storing XLM exchange rates. However, the rate fetching and caching logic may not be fully implemented. Payment receipts need to show the USD equivalent of XLM/USDC payments, which requires accurate exchange rate data.

**Why it matters in production:** Without accurate exchange rate data, payment receipts show incorrect USD equivalents, which can cause accounting discrepancies and patient confusion.

## Tasks

- [ ] Implement a scheduled job to fetch XLM/USD rates from a reliable source (CoinGecko, Stellar DEX)
- [ ] Cache rates in Redis with a 5-minute TTL
- [ ] Store historical rates in \`XlmRateModel\` for audit purposes
- [ ] Use the cached rate when generating payment receipts
- [ ] Add a \`GET /api/v1/payments/exchange-rate\` endpoint
- [ ] Add rate staleness detection (alert if rate is older than 15 minutes)
- [ ] Write tests for rate fetching and caching
- [ ] Update Swagger docs

## Acceptance Criteria

- XLM/USD rates are fetched and cached every 5 minutes
- Historical rates are stored for audit purposes
- Payment receipts use the rate at the time of payment
- Alert fires if rate data is stale
- Tests cover rate fetching, caching, and staleness detection"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add comprehensive error boundary components in Next.js frontend" \
  --label "enhancement,frontend,reliability" \
  --body "## Description

The Next.js frontend (\`apps/web\`) does not appear to have React Error Boundary components. If a component throws an error during rendering (e.g., due to unexpected API response shape), the entire page crashes with a white screen. In a clinical setting, this can prevent clinicians from accessing patient data.

**Why it matters in production:** Component-level errors should be contained and show a helpful error message, not crash the entire application.

## Tasks

- [ ] Create an \`ErrorBoundary\` component in \`apps/web/src/components/\`
- [ ] Wrap major page sections (patient list, encounter form, payment panel) with error boundaries
- [ ] Show a user-friendly error message with a retry button
- [ ] Report errors to Sentry from the error boundary
- [ ] Add a global error boundary in the root layout
- [ ] Create a custom \`error.tsx\` page for Next.js App Router error handling
- [ ] Write tests for error boundary behavior
- [ ] Add error boundary to the Storybook component library

## Acceptance Criteria

- Component errors are caught by error boundaries
- User sees a helpful error message with a retry button
- Errors are reported to Sentry
- The rest of the page remains functional when one section errors
- Tests verify error boundary behavior"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add clinic-specific ICD-10 code favorites and custom code sets" \
  --label "enhancement,clinical,usability" \
  --body "## Description

The \`apps/api/src/modules/icd10/icd10.controller.ts\` provides ICD-10 code search across the full 70,000+ code database. However, each clinic typically uses a small subset of codes relevant to their specialty. There is no way for clinics to save favorite codes or create custom code sets for quick access.

**Why it matters in production:** Searching through 70,000 codes for every encounter is inefficient. Clinic-specific favorites reduce coding time and errors.

## Tasks

- [ ] Add a \`ClinicICD10FavoritesModel\` with \`clinicId\` and \`codes\` array
- [ ] Add \`POST /api/v1/icd10/favorites\` endpoint to add a favorite code
- [ ] Add \`DELETE /api/v1/icd10/favorites/:code\` endpoint to remove a favorite
- [ ] Add \`GET /api/v1/icd10/favorites\` endpoint to list favorites
- [ ] Add a \`GET /api/v1/icd10/recent\` endpoint showing recently used codes per clinic
- [ ] Update the ICD-10 search to show favorites first
- [ ] Add a favorites management UI in the settings page
- [ ] Write tests for favorites management

## Acceptance Criteria

- Clinics can save favorite ICD-10 codes
- Favorites appear first in search results
- Recently used codes are tracked per clinic
- Favorites management UI is available in settings
- Tests cover favorites CRUD operations"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add automated test data cleanup after E2E tests" \
  --label "enhancement,testing,ci-cd" \
  --body "## Description

The E2E tests in \`apps/web/e2e/\` create test data (patients, encounters, payments) in the test database. However, there is no cleanup mechanism to remove this data after tests complete. Over time, test data accumulates and can affect test reliability (e.g., duplicate detection tests may fail due to leftover data).

**Why it matters in production:** Accumulated test data causes flaky tests and makes it harder to reason about test state. Clean test environments are essential for reliable CI.

## Tasks

- [ ] Add a \`globalSetup\` and \`globalTeardown\` in \`playwright.config.ts\` to seed and clean test data
- [ ] Create a \`scripts/e2e-seed.ts\` script that creates known test fixtures
- [ ] Create a \`scripts/e2e-cleanup.ts\` script that removes all test data
- [ ] Use unique identifiers (e.g., \`E2E_TEST_\` prefix) for all test-created data
- [ ] Add database cleanup to the CI workflow after E2E tests
- [ ] Implement test isolation using separate test databases per CI run
- [ ] Write documentation for the E2E test data strategy
- [ ] Verify cleanup runs even when tests fail

## Acceptance Criteria

- Test data is cleaned up after every E2E test run
- Cleanup runs even when tests fail
- Test data uses unique identifiers to avoid conflicts
- CI uses isolated test databases
- Documentation explains the test data strategy"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add GraphQL API layer for flexible data querying" \
  --label "enhancement,api,developer-experience" \
  --body "## Description

The current REST API requires multiple round trips to fetch related data (e.g., patient + encounters + payments + lab results). A GraphQL API layer would allow clients to fetch exactly the data they need in a single request, reducing over-fetching and under-fetching.

**Why it matters in production:** Multiple API round trips increase page load time and network usage. GraphQL would significantly improve the frontend performance for complex views like the patient detail page.

## Tasks

- [ ] Add Apollo Server or GraphQL Yoga to \`apps/api\`
- [ ] Define GraphQL schema for Patient, Encounter, Payment, LabResult, and Appointment types
- [ ] Implement resolvers for each type
- [ ] Add DataLoader for N+1 query prevention
- [ ] Add GraphQL authentication using the existing JWT middleware
- [ ] Add GraphQL query depth limiting to prevent DoS attacks
- [ ] Add GraphQL introspection disable in production
- [ ] Write tests for GraphQL resolvers

## Acceptance Criteria

- GraphQL endpoint is available at \`/api/graphql\`
- Patient detail page data can be fetched in a single GraphQL query
- Authentication is enforced on all GraphQL queries
- Query depth is limited to prevent DoS
- Tests cover all GraphQL resolvers"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add clinic revenue analytics and financial reporting" \
  --label "enhancement,reporting,billing" \
  --body "## Description

The \`apps/api/src/modules/reports/reports.controller.ts\` generates various reports. However, financial reports (revenue by period, outstanding balances, payment method breakdown, collection rates) may be incomplete or missing. Clinic administrators need comprehensive financial reporting for business management.

**Why it matters in production:** Without financial reporting, clinic administrators cannot track revenue, identify collection issues, or make informed business decisions.

## Tasks

- [ ] Add a \`GET /api/v1/reports/revenue\` endpoint with daily/weekly/monthly revenue breakdown
- [ ] Add a \`GET /api/v1/reports/outstanding-balances\` endpoint
- [ ] Add a \`GET /api/v1/reports/payment-methods\` endpoint showing XLM vs USDC breakdown
- [ ] Add a \`GET /api/v1/reports/collection-rate\` endpoint
- [ ] Add revenue trends to the dashboard
- [ ] Add financial report export to CSV and PDF
- [ ] Write tests for financial calculations
- [ ] Update Swagger docs

## Acceptance Criteria

- Revenue report shows daily/weekly/monthly breakdown
- Outstanding balances report is accurate
- Payment method breakdown is available
- Collection rate is calculated correctly
- Financial reports can be exported to CSV and PDF"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient portal appointment booking" \
  --label "enhancement,portal,appointments" \
  --body "## Description

The patient portal (\`apps/api/src/modules/portal/portal.controller.ts\`) allows patients to view their records. However, patients cannot book appointments through the portal. They must call the clinic or use a separate booking system.

**Why it matters in production:** Online appointment booking is a key patient engagement feature. Without it, patients must call during business hours, creating friction and reducing appointment adherence.

## Tasks

- [ ] Add \`GET /api/v1/portal/appointments/available-slots\` endpoint showing available time slots
- [ ] Add \`POST /api/v1/portal/appointments\` endpoint for patients to book appointments
- [ ] Add \`DELETE /api/v1/portal/appointments/:id\` for cancellations
- [ ] Integrate with the existing \`schedules\` module for availability
- [ ] Send confirmation emails for bookings and cancellations
- [ ] Add appointment booking to the patient portal UI
- [ ] Implement booking rules (advance notice, cancellation policy)
- [ ] Write tests for the booking flow

## Acceptance Criteria

- Patients can view available appointment slots
- Patients can book and cancel appointments via the portal
- Confirmation emails are sent for bookings and cancellations
- Booking rules are enforced (advance notice, cancellation policy)
- Tests cover the complete booking flow"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar payment QR code generation improvements" \
  --label "enhancement,payments,frontend" \
  --body "## Description

The \`apps/api/src/modules/payments/services/qr-code.service.ts\` generates QR codes for Stellar payments. However, the QR code may not follow the Stellar URI scheme standard (SEP-0007), which is required for compatibility with Stellar-compatible wallets.

**Why it matters in production:** Non-standard QR codes cannot be scanned by Stellar wallets, forcing patients to manually enter payment details. This creates friction and increases payment errors.

## Tasks

- [ ] Update \`qr-code.service.ts\` to generate SEP-0007 compliant Stellar URIs
- [ ] Include all required fields: \`destination\`, \`amount\`, \`asset_code\`, \`asset_issuer\`, \`memo\`
- [ ] Add QR code size and error correction level configuration
- [ ] Add a QR code preview in the payment UI
- [ ] Add a \`GET /api/v1/payments/:id/qr\` endpoint returning the QR code image
- [ ] Test QR code scanning with popular Stellar wallets
- [ ] Write tests for SEP-0007 URI generation
- [ ] Update Swagger docs

## Acceptance Criteria

- QR codes follow the SEP-0007 Stellar URI scheme
- QR codes can be scanned by Stellar-compatible wallets
- QR code includes all required payment fields
- \`GET /api/v1/payments/:id/qr\` returns a valid QR code image
- Tests verify SEP-0007 compliance"

echo "Issues 91-100 created successfully"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add encounter template versioning and clinic-specific customization" \
  --label "enhancement,clinical,templates" \
  --body "## Description

The \`apps/api/src/modules/encounters/encounter-templates.controller.ts\` and \`encounter-template.model.ts\` implement encounter templates. However, templates may not support versioning (tracking changes over time) or clinic-specific customization (each clinic having their own template variants).

**Why it matters in production:** Encounter templates evolve as clinical practices change. Without versioning, it's impossible to know which template version was used for a historical encounter.

## Tasks

- [ ] Add \`version\`, \`previousVersionId\`, and \`isLatest\` fields to \`encounter-template.model.ts\`
- [ ] Add \`clinicId\` scoping to templates (global templates + clinic-specific overrides)
- [ ] Add a \`POST /api/v1/encounter-templates/:id/clone\` endpoint for clinic customization
- [ ] Add template version history endpoint
- [ ] Link encounters to the specific template version used
- [ ] Add template preview functionality
- [ ] Write tests for versioning and clinic customization
- [ ] Update Swagger docs

## Acceptance Criteria

- Template updates create new versions, not overwrites
- Clinics can create custom versions of global templates
- Encounters record which template version was used
- Template version history is accessible via the API
- Tests cover versioning and customization"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add automated security headers testing in CI" \
  --label "security,ci-cd,enhancement" \
  --body "## Description

The \`apps/api/docs/security-headers.md\` documents the security headers configured via Helmet in \`app.ts\`. However, there is no automated testing to verify that these headers are actually present in API responses. A misconfiguration or Helmet update could silently remove security headers.

**Why it matters in production:** Missing security headers (CSP, HSTS, X-Frame-Options) leave the application vulnerable to XSS, clickjacking, and other attacks.

## Tasks

- [ ] Add a security headers test in the API test suite
- [ ] Verify all Helmet-configured headers are present in responses
- [ ] Test CSP header includes all required directives
- [ ] Test HSTS header has correct max-age and includeSubDomains
- [ ] Add a CI step using \`securityheaders.com\` API or \`helmet-csp-validator\`
- [ ] Add security header testing to the E2E test suite for the frontend
- [ ] Update \`security-headers.md\` with testing instructions
- [ ] Add a Prometheus metric for security header violations

## Acceptance Criteria

- CI verifies all security headers are present in API responses
- CSP header is validated against the configured directives
- HSTS header has correct configuration
- E2E tests verify security headers on frontend responses
- Tests fail if any required header is missing"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient health summary generation using AI" \
  --label "enhancement,ai,clinical" \
  --body "## Description

The \`apps/api/src/modules/ai/ai.service.ts\` has \`generatePatientInsights\` for longitudinal analysis. However, there is no endpoint that generates a comprehensive patient health summary — a one-page overview of the patient's current health status, active conditions, current medications, recent lab results, and upcoming appointments.

**Why it matters in production:** Clinicians often need a quick overview of a patient's health status before a consultation. A comprehensive AI-generated summary saves time and reduces the risk of missing important information.

## Tasks

- [ ] Add a \`POST /api/v1/ai/patient-summary/:patientId\` endpoint
- [ ] Aggregate data from encounters, lab results, medications, allergies, and appointments
- [ ] Use Gemini to generate a structured summary with sections: Active Conditions, Current Medications, Recent Lab Results, Upcoming Appointments, Risk Factors
- [ ] Strip PII before sending to Gemini
- [ ] Cache the summary in Redis with a 1-hour TTL
- [ ] Add a \`lastSummaryGeneratedAt\` field to the patient model
- [ ] Write tests for summary generation
- [ ] Update Swagger docs

## Acceptance Criteria

- Patient health summary is generated via the API
- Summary includes all specified sections
- PII is stripped before sending to Gemini
- Summary is cached for 1 hour
- Tests cover summary generation and caching"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add multi-language support for email notifications" \
  --label "enhancement,i18n,notifications" \
  --body "## Description

The \`apps/api/src/lib/email.service.ts\` sends email notifications (password reset, welcome, payment confirmation, etc.). However, emails are likely sent in English only, regardless of the user's language preference stored in \`UserModel.preferences.language\`.

**Why it matters in production:** French-speaking users receive English emails, which is a poor user experience and may cause confusion for important notifications like password resets.

## Tasks

- [ ] Create email templates in both English and French for all notification types
- [ ] Update \`email.service.ts\` to select the template based on \`user.preferences.language\`
- [ ] Add a template rendering system (Handlebars or similar)
- [ ] Add French translations for all email subjects and bodies
- [ ] Add a CI check that verifies all email templates have French translations
- [ ] Test email rendering in both languages
- [ ] Add support for additional languages via a plugin system
- [ ] Write tests for language selection logic

## Acceptance Criteria

- Emails are sent in the user's preferred language
- All email types have French translations
- CI fails if a new email template lacks French translation
- Tests verify language selection for each email type
- Template rendering is tested for both languages"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar account key rotation with zero-downtime migration" \
  --label "enhancement,blockchain,security" \
  --body "## Description

The \`apps/api/src/modules/clinics/keypair.service.ts\` handles Stellar keypair management. The \`keypair.service.test.ts\` tests keypair operations. However, key rotation (replacing an old keypair with a new one) requires transferring the XLM balance from the old account to the new account, which involves a Stellar transaction.

The \`stellar-client.ts\` has a \`transferBalance\` method, but the full key rotation workflow (generate new keypair → create new account → transfer balance → update trustlines → update clinic record → deactivate old keypair) may not be fully implemented.

**Why it matters in production:** Regular key rotation is a security best practice. Without a smooth rotation process, clinics may avoid rotating keys, leaving compromised keys in use.

## Tasks

- [ ] Implement the complete key rotation workflow in \`keypair.service.ts\`
- [ ] Add a \`POST /api/v1/clinics/:id/keypair/rotate\` endpoint
- [ ] Implement atomic rotation: new keypair is only activated after successful balance transfer
- [ ] Add rollback capability if rotation fails midway
- [ ] Add \`KEYPAIR_ROTATE\` audit logging (already in \`AuditAction\` enum)
- [ ] Send email notification to clinic admin after successful rotation
- [ ] Write tests for the rotation workflow including failure scenarios
- [ ] Update Swagger docs

## Acceptance Criteria

- Key rotation transfers balance to the new account before activating it
- Rotation is atomic (rollback on failure)
- Audit log records the rotation
- Email notification is sent after successful rotation
- Tests cover successful rotation and failure/rollback scenarios"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient portal health record timeline view" \
  --label "enhancement,portal,frontend" \
  --body "## Description

The patient portal (\`apps/api/src/modules/portal/portal.controller.ts\`) allows patients to view their records. However, the data is likely presented as separate lists (encounters, lab results, medications) rather than a unified chronological timeline. A timeline view would give patients a better understanding of their health journey.

**Why it matters in production:** A fragmented view of health records makes it difficult for patients to understand their health history. A timeline view improves patient engagement and health literacy.

## Tasks

- [ ] Create a \`GET /api/v1/portal/timeline\` endpoint that returns all health events in chronological order
- [ ] Include: encounters, lab results, immunizations, prescriptions, and appointments
- [ ] Add filtering by date range and event type
- [ ] Create a timeline UI component in the patient portal frontend
- [ ] Add pagination for the timeline
- [ ] Add event detail views accessible from the timeline
- [ ] Write tests for the timeline endpoint
- [ ] Update Swagger docs

## Acceptance Criteria

- Timeline endpoint returns all health events in chronological order
- Events can be filtered by type and date range
- Timeline is paginated
- Frontend shows a visual timeline with event details
- Tests cover timeline retrieval and filtering"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add automated code quality metrics tracking with SonarQube" \
  --label "enhancement,code-quality,ci-cd" \
  --body "## Description

The CI pipeline includes ESLint and TypeScript checks but no code quality metrics tracking (code coverage trends, technical debt, code duplication, complexity). SonarQube or SonarCloud would provide these metrics and track them over time.

**Why it matters in production:** Without code quality metrics, technical debt accumulates invisibly. Tracking metrics over time enables the team to make informed decisions about refactoring priorities.

## Tasks

- [ ] Add SonarCloud integration to the CI pipeline
- [ ] Configure SonarCloud project for the monorepo
- [ ] Set quality gates: coverage > 70%, no new critical issues, duplication < 3%
- [ ] Add SonarCloud badge to \`README.md\`
- [ ] Configure SonarCloud to analyze all three apps (api, web, stellar-service)
- [ ] Add SonarCloud PR decoration (comments on PRs with quality metrics)
- [ ] Fix all existing SonarCloud critical and major issues
- [ ] Document quality gate requirements in \`CONTRIBUTING.md\`

## Acceptance Criteria

- SonarCloud analyzes all three apps in CI
- Quality gates are enforced (coverage, issues, duplication)
- PR decoration shows quality metrics on each PR
- SonarCloud badge is in README
- All critical SonarCloud issues are resolved"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar payment path finding UI for multi-asset payments" \
  --label "enhancement,blockchain,frontend" \
  --body "## Description

The \`apps/api/src/modules/payments/payments.controller.ts\` has a \`GET /payments/paths\` endpoint for discovering Stellar payment paths (allowing patients to pay in one asset while the clinic receives another). However, there is no frontend UI that uses this endpoint to show patients their payment options.

**Why it matters in production:** Path payments enable patients to pay in their preferred asset (e.g., XLM) while the clinic receives USDC. Without a UI, this feature is inaccessible to end users.

## Tasks

- [ ] Create a payment path selection component in the frontend
- [ ] Show available payment paths with exchange rates and fees
- [ ] Allow patients to select their preferred payment asset
- [ ] Show the estimated amount in the source asset
- [ ] Update the payment intent creation to include path payment parameters
- [ ] Add a path payment confirmation step
- [ ] Write E2E tests for path payment selection
- [ ] Update Swagger docs

## Acceptance Criteria

- Payment UI shows available payment paths
- Patients can select their preferred payment asset
- Exchange rates and fees are displayed
- Path payment parameters are included in the payment intent
- E2E tests cover path payment selection"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add comprehensive logging for all Stellar blockchain operations" \
  --label "enhancement,observability,blockchain" \
  --body "## Description

The \`apps/stellar-service/src/logger.ts\` is a minimal logger. The stellar-service performs critical blockchain operations (fund accounts, create trustlines, send payments, fee bumps) but may not log all operations with sufficient detail for audit and debugging purposes.

**Why it matters in production:** Blockchain operations are irreversible. Comprehensive logging is essential for debugging failed transactions and demonstrating compliance.

## Tasks

- [ ] Add structured logging to all stellar-service operations with: operation type, public key, amount, asset, transaction hash, and outcome
- [ ] Add request/response logging for all Horizon API calls
- [ ] Add timing metrics for each operation
- [ ] Log all errors with full context (not just error message)
- [ ] Add log correlation with the API request ID
- [ ] Configure log levels appropriately (debug for Horizon responses, info for operations, error for failures)
- [ ] Add log rotation and retention configuration
- [ ] Write tests verifying log output for key operations

## Acceptance Criteria

- All stellar-service operations are logged with full context
- Horizon API calls are logged with request/response details
- Errors include full context for debugging
- Log correlation with API request ID works
- Tests verify log output for key operations"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient risk score explanation and factor breakdown" \
  --label "enhancement,ai,clinical" \
  --body "## Description

The \`apps/api/src/modules/ai/risk-calculator.ts\` calculates patient risk scores. The \`PatientModel\` stores \`riskScore\`, \`riskLevel\`, and \`riskFactors\`. However, the risk score may be presented to clinicians without a clear explanation of which factors contributed most to the score.

**Why it matters in production:** Clinicians need to understand why a patient is classified as high-risk to take appropriate action. A black-box risk score without explanation is less actionable.

## Tasks

- [ ] Add a \`riskFactorWeights\` field to the patient model showing each factor's contribution
- [ ] Add a \`GET /api/v1/patients/:id/risk-explanation\` endpoint
- [ ] Use Gemini to generate a natural language explanation of the risk factors
- [ ] Add a risk factor breakdown visualization in the frontend
- [ ] Add trend indicators showing which factors are improving or worsening
- [ ] Add recommendations for addressing high-risk factors
- [ ] Write tests for risk explanation generation
- [ ] Update Swagger docs

## Acceptance Criteria

- Risk explanation endpoint returns factor weights and natural language explanation
- Frontend shows a risk factor breakdown visualization
- Trend indicators show factor changes over time
- Recommendations are provided for high-risk factors
- Tests cover explanation generation"

echo "Issues 101-110 created successfully"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add dark mode support to the frontend" \
  --label "enhancement,frontend,accessibility" \
  --body "## Description

The frontend uses Tailwind CSS (\`apps/web/tailwind.config.ts\`) which supports dark mode via the \`dark:\` variant. However, dark mode may not be implemented across all components. Healthcare workers often work in low-light environments (e.g., hospital wards at night) where dark mode reduces eye strain.

**Why it matters in production:** Dark mode is an accessibility feature that reduces eye strain for clinicians working long shifts in low-light environments.

## Tasks

- [ ] Enable Tailwind dark mode (\`darkMode: 'class'\`) in \`tailwind.config.ts\`
- [ ] Add dark mode variants to all UI components
- [ ] Add a dark mode toggle in the user settings
- [ ] Persist dark mode preference in \`UserModel.preferences\`
- [ ] Respect the system \`prefers-color-scheme\` media query as the default
- [ ] Test dark mode across all major pages
- [ ] Add dark mode to the Playwright E2E tests
- [ ] Update the design system documentation

## Acceptance Criteria

- Dark mode is available and toggleable from user settings
- Dark mode preference is persisted across sessions
- System dark mode preference is respected by default
- All UI components have dark mode variants
- E2E tests verify dark mode rendering"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Stellar claimable balance expiration notifications" \
  --label "enhancement,blockchain,notifications" \
  --body "## Description

The \`PaymentRecordModel\` has \`claimableAfter\` and \`claimableUntil\` fields for claimable balance payments. The \`apps/api/src/modules/payments/claimable-balance.controller.ts\` manages claimable balances. However, there are no notifications when a claimable balance is about to expire (\`claimableUntil\` approaching).

**Why it matters in production:** If a patient doesn't claim their payment before \`claimableUntil\`, the funds are returned to the clinic. Without notifications, patients may miss the claiming window.

## Tasks

- [ ] Add a scheduled job that checks for claimable balances expiring within 24 hours
- [ ] Send email notifications to patients when their claimable balance is about to expire
- [ ] Create in-app notifications via \`NotificationModel\`
- [ ] Emit \`payment:claimable_expiring\` Socket.IO event
- [ ] Add a \`claimableExpiryNotificationSent\` flag to \`PaymentRecordModel\`
- [ ] Add a \`GET /api/v1/payments/expiring-claimable\` endpoint for CLINIC_ADMIN
- [ ] Write tests for the expiration notification job
- [ ] Update Swagger docs

## Acceptance Criteria

- Patients receive notifications 24 hours before claimable balance expiry
- Notifications are sent via email and in-app
- Socket.IO event is emitted for expiring balances
- Notification is only sent once per balance
- Tests cover the expiration notification job"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add comprehensive unit tests for the anonymization package" \
  --label "testing,security,compliance" \
  --body "## Description

The \`packages/anonymize/src/index.test.ts\` file exists and tests the anonymization package. However, the tests may not cover all 18 HIPAA Safe Harbor identifiers, edge cases in PII pattern matching, and all anonymization levels (de-identification, pseudonymization, aggregation).

**Why it matters in production:** The anonymization package is used for AI processing and research exports. Incomplete tests mean PII could leak through the anonymization layer.

## Tasks

- [ ] Add tests for all 18 HIPAA Safe Harbor identifiers
- [ ] Add tests for edge cases: partial names, initials, nicknames
- [ ] Add tests for all three anonymization levels
- [ ] Add tests for the \`purpose\` parameter (\`ai\`, \`research\`, \`export\`)
- [ ] Add tests for clinical notes with embedded PII
- [ ] Add property-based tests using fast-check for PII pattern matching
- [ ] Achieve 100% code coverage for the anonymization package
- [ ] Add performance tests for large clinical notes

## Acceptance Criteria

- All 18 HIPAA Safe Harbor identifiers are tested
- All anonymization levels are tested
- Code coverage is 100% for the anonymization package
- Property-based tests verify PII pattern matching
- Performance tests verify anonymization speed for large inputs"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add Kubernetes network policies for service isolation" \
  --label "security,infrastructure,enhancement" \
  --body "## Description

The \`k8s/\` directory contains Kubernetes manifests but no NetworkPolicy resources. Without network policies, all pods in the \`health-watchers\` namespace can communicate with each other freely. The stellar-service should only be accessible from the API, not from the web frontend or other services.

**Why it matters in production:** Without network policies, a compromised web pod could directly call the stellar-service, bypassing the API's authentication and authorization layer.

## Tasks

- [ ] Create \`k8s/network-policies.yaml\` with policies for each service
- [ ] Allow: web → api (port 3001), api → stellar-service (port 3002), api → MongoDB (port 27017), api → Redis (port 6379)
- [ ] Deny: web → stellar-service (direct), web → MongoDB, web → Redis
- [ ] Add a default deny-all policy for the namespace
- [ ] Update Helm chart to include network policies
- [ ] Test network policies in a local Kubernetes cluster
- [ ] Document network topology in \`k8s/README.md\`
- [ ] Add network policy validation to CI

## Acceptance Criteria

- Network policies are defined for all services
- Web pod cannot directly access stellar-service
- Web pod cannot directly access MongoDB or Redis
- Default deny-all policy is in place
- Network policies are included in the Helm chart"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient consent form digital signature with audit trail" \
  --label "enhancement,compliance,legal" \
  --body "## Description

The \`apps/api/src/modules/consent/consent.model.ts\` and \`consent.controller.ts\` manage patient consent. However, consent may be recorded as a simple boolean without a cryptographic signature. For legal validity, consent should include a digital signature (or at minimum, a timestamped IP address and user agent).

**Why it matters in production:** In legal proceedings, a consent record without a verifiable signature may be challenged. A cryptographically signed consent record provides stronger legal protection.

## Tasks

- [ ] Add \`signatureData\`, \`signedAt\`, \`ipAddress\`, \`userAgent\`, and \`signatureHash\` fields to \`consent.model.ts\`
- [ ] Generate a SHA-256 hash of the consent content + patient ID + timestamp as the signature
- [ ] Add a digital signature pad component to the patient portal
- [ ] Store the signature image as a base64 string
- [ ] Add consent signature verification endpoint
- [ ] Add consent signature to the audit log
- [ ] Write tests for signature generation and verification
- [ ] Update Swagger docs

## Acceptance Criteria

- Consent records include a cryptographic signature hash
- Signature includes IP address and user agent for legal traceability
- Digital signature pad is available in the patient portal
- Signature verification endpoint confirms consent integrity
- Tests cover signature generation and verification"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add automated changelog generation from conventional commits" \
  --label "enhancement,ci-cd,developer-experience" \
  --body "## Description

The project uses \`@changesets/cli\` (as seen in \`.changeset/config.json\` and \`CHANGELOG.md\`). However, the changeset workflow requires developers to manually create changeset files. The \`.github/workflows/changeset-check.yml\` enforces changeset creation but doesn't automate it.

Conventional commits (feat:, fix:, chore:) could be used to automatically generate changelogs without manual changeset creation.

**Why it matters in production:** Manual changelog maintenance is error-prone and often skipped. Automated changelog generation ensures the changelog is always up to date.

## Tasks

- [ ] Add \`commitlint\` configuration to enforce conventional commit format
- [ ] Update \`.husky/commit-msg\` to run \`commitlint\`
- [ ] Add a \`release-please\` or \`semantic-release\` workflow for automated releases
- [ ] Configure automatic version bumping based on commit types
- [ ] Generate \`CHANGELOG.md\` automatically from conventional commits
- [ ] Add a PR title linting check (enforce conventional commit format for PR titles)
- [ ] Update \`CONTRIBUTING.md\` with conventional commit guidelines
- [ ] Write documentation for the release process

## Acceptance Criteria

- Commits must follow conventional commit format (enforced by commitlint)
- \`CHANGELOG.md\` is automatically updated on release
- Version is automatically bumped based on commit types
- PR titles are validated against conventional commit format
- \`CONTRIBUTING.md\` documents the commit convention"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add comprehensive Grafana dashboards for all services" \
  --label "enhancement,observability,monitoring" \
  --body "## Description

The \`monitoring/grafana/provisioning/\` directory contains Grafana provisioning configuration. However, the dashboards may be incomplete or missing for key metrics: API performance, MongoDB performance, Stellar payment metrics, and business KPIs.

**Why it matters in production:** Without comprehensive dashboards, the operations team cannot quickly assess system health during incidents.

## Tasks

- [ ] Create an API performance dashboard: request rate, error rate, latency percentiles (p50, p95, p99)
- [ ] Create a MongoDB dashboard: query performance, connection pool, collection sizes
- [ ] Create a Stellar payments dashboard: payment success rate, transaction fees, balance levels
- [ ] Create a business KPIs dashboard: patients created, encounters, revenue
- [ ] Create a security dashboard: failed logins, rate limit violations, audit log volume
- [ ] Add dashboard provisioning to \`monitoring/grafana/provisioning/dashboards/\`
- [ ] Add alerting rules for each dashboard
- [ ] Document dashboard usage in \`monitoring/\` README

## Acceptance Criteria

- All 5 dashboards are provisioned automatically
- Each dashboard has relevant alerting rules
- Dashboards are accessible in Grafana without manual configuration
- Dashboard documentation is available
- All metrics used in dashboards are exported by the services"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add patient insurance information management" \
  --label "enhancement,clinical,billing" \
  --body "## Description

The \`PatientModel\` does not include insurance information fields. In a healthcare setting, insurance information is essential for billing and claims processing. Clinics need to store patient insurance provider, policy number, group number, and coverage details.

**Why it matters in production:** Without insurance information, clinics cannot submit insurance claims, leading to delayed or missed reimbursements.

## Tasks

- [ ] Add an \`insurance\` array field to \`patient.model.ts\` with: \`provider\`, \`policyNumber\`, \`groupNumber\`, \`coverageType\`, \`effectiveDate\`, \`expirationDate\`, \`isPrimary\`
- [ ] Encrypt insurance fields as PHI
- [ ] Add insurance management endpoints to \`patients.controller.ts\`
- [ ] Add insurance information to the patient detail view
- [ ] Add insurance verification integration (optional: Availity or similar)
- [ ] Add insurance to the FHIR R4 export (Coverage resource)
- [ ] Write tests for insurance CRUD operations
- [ ] Update Swagger docs

## Acceptance Criteria

- Insurance information can be added, updated, and deleted for patients
- Insurance fields are encrypted as PHI
- Insurance is included in FHIR R4 exports
- Tests cover insurance CRUD operations
- Swagger docs describe insurance endpoints"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add real-time appointment status updates via Socket.IO" \
  --label "enhancement,realtime,appointments" \
  --body "## Description

The \`apps/api/src/modules/appointments/appointments.controller.ts\` manages appointments. When an appointment status changes (confirmed, cancelled, rescheduled, patient arrived), there is no real-time notification to the relevant parties.

**Why it matters in production:** Real-time appointment status updates improve clinic workflow efficiency. Staff need to know immediately when a patient arrives or cancels.

## Tasks

- [ ] Emit \`appointment:confirmed\` Socket.IO event when an appointment is confirmed
- [ ] Emit \`appointment:cancelled\` Socket.IO event when cancelled
- [ ] Emit \`appointment:patient_arrived\` Socket.IO event when patient checks in
- [ ] Emit \`appointment:rescheduled\` Socket.IO event when rescheduled
- [ ] Add appointment status to the \`NotificationModel\`
- [ ] Add a check-in endpoint: \`POST /api/v1/appointments/:id/check-in\`
- [ ] Update the frontend to show real-time appointment status
- [ ] Write tests for Socket.IO event emission

## Acceptance Criteria

- All appointment status changes emit Socket.IO events
- Notifications are created for each status change
- Frontend shows real-time appointment status updates
- Check-in endpoint is available
- Tests verify Socket.IO event emission for each status change"

gh issue create --repo "$REPO" \
  --title "Enhancement: Add API versioning strategy for backward compatibility" \
  --label "enhancement,api,developer-experience" \
  --body "## Description

The API uses \`/api/v1/\` prefix and the \`apiVersionHeader\` middleware adds a version header. However, there is no strategy for introducing breaking changes in a backward-compatible way. When the API needs to change a response shape, all clients must update simultaneously.

**Why it matters in production:** As the API evolves, breaking changes without versioning force all clients to update simultaneously, causing downtime and coordination overhead.

## Tasks

- [ ] Define an API versioning strategy (URL versioning: \`/api/v2/\`, or header versioning)
- [ ] Create a \`/api/v2/\` router for breaking changes
- [ ] Add a deprecation warning header for \`/api/v1/\` endpoints that will be removed
- [ ] Add a \`GET /api/versions\` endpoint listing all supported versions and their deprecation dates
- [ ] Add a sunset date policy (minimum 6 months notice before removing a version)
- [ ] Update the frontend to use the latest API version
- [ ] Document the versioning strategy in the API documentation
- [ ] Write tests for version negotiation

## Acceptance Criteria

- \`/api/v2/\` is available for new breaking changes
- Deprecated endpoints include a \`Deprecation\` header with sunset date
- \`GET /api/versions\` lists all supported versions
- Sunset policy is documented
- Tests verify version negotiation behavior"

echo "Issues 111-120 created successfully"
