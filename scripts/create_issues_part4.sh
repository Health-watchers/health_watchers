#!/bin/bash
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "Patient data returned without field filtering — internal fields exposed" \
  --label "security" \
  --body "**Branch:** \`fix/patient-response-field-filtering\`
**Timeframe:** 1 day

## Description
API endpoints return full Mongoose documents including \`__v\`, raw \`_id\` ObjectIds, \`clinicId\`, \`isActive\`, and \`searchName\`. These internal fields leak database structure to clients.

## Tasks
- Create a \`toPatientResponse(doc)\` transformer function in \`patients.transformer.ts\`
- The response shape should include: \`id\`, \`systemId\`, \`firstName\`, \`lastName\`, \`dateOfBirth\`, \`sex\`, \`contactNumber\`, \`address\`, \`createdAt\`, \`updatedAt\`
- Exclude: \`__v\`, \`_id\` (raw), \`clinicId\`, \`isActive\`, \`searchName\`
- Apply the transformer to all patient endpoint responses
- Do the same for encounters and payments

## Acceptance Criteria
- \`GET /patients/:id\` response does not contain \`__v\`, \`clinicId\`, \`isActive\`, or \`searchName\`
- The \`id\` field in the response is a string, not a MongoDB ObjectId object"

gh issue create --repo "$REPO" \
  --title "\`zod\` missing from \`apps/api\` dependencies" \
  --label "bug" \
  --body "**Branch:** \`fix/add-zod-to-api-deps\`
**Timeframe:** 1 hour

## Description
\`apps/api/src/middlewares/validate.middleware.ts\` and all \`*.validation.ts\` files import from \`zod\`. However, \`zod\` is not listed in \`apps/api/package.json\` dependencies. It may work locally if \`zod\` is hoisted, but this will break in clean installs or CI environments.

## Tasks
- Add \`\"zod\": \"^3.22.0\"\` to \`apps/api/package.json\` \`dependencies\`
- Add \`\"zod\": \"^3.22.0\"\` to \`apps/web/package.json\` \`dependencies\`
- Run \`npm install\` to update \`package-lock.json\`

## Acceptance Criteria
- \`zod\` is listed in \`apps/api/package.json\` \`dependencies\`
- \`npm ci\` in a fresh clone resolves \`zod\` for the API without relying on hoisting
- \`npm run build\` succeeds in the API package after the change"

gh issue create --repo "$REPO" \
  --title "\`packages/types/index.ts\` and \`packages/types/src/index.ts\` both exist — ambiguous entry point" \
  --label "bug" \
  --body "**Branch:** \`fix/types-package-entry-point\`
**Timeframe:** 3 hours

## Description
Two \`index.ts\` files exist in \`packages/types\`. The \`package.json\` for \`packages/types\` has no \`main\` or \`exports\` field, so TypeScript and Node resolve the entry point ambiguously.

## Tasks
- Remove \`packages/types/index.ts\` (the root-level re-export file)
- Add \`\"main\": \"src/index.ts\"\` to \`packages/types/package.json\` for development
- Add \`\"exports\"\` field for production builds
- Add a \`build\` script to \`packages/types/package.json\`

## Acceptance Criteria
- Only one \`index.ts\` exists in \`packages/types\`
- \`packages/types/package.json\` has explicit \`main\` and \`exports\` fields
- \`import { Patient } from '@health-watchers/types'\` resolves to the correct type in both API and web"

gh issue create --repo "$REPO" \
  --title "No AI implementation — \`POST /ai/summarize\` returns 501" \
  --label "enhancement" \
  --body "**Branch:** \`feat/ai-summarize-gemini\`
**Timeframe:** 3 days

## Description
\`apps/api/src/modules/ai/ai.routes.ts\` has a single route \`POST /ai/summarize\` that returns 501. The README lists AI clinical summaries as a key feature. The \`EncounterModel\` has an \`aiSummary\` field. The \`GEMINI_API_KEY\` env var is configured. None of this is wired together.

## Tasks
- Install \`@google/generative-ai\` in \`apps/api\`
- Create \`ai.service.ts\` that initialises the Gemini client using \`config.geminiApiKey\`
- Implement \`POST /api/v1/ai/summarize\` accepting \`{ encounterId }\`, fetching the encounter, and sending clinical notes to Gemini
- Store the result in \`encounter.aiSummary\` and return it in the response
- Handle Gemini API errors gracefully

## Acceptance Criteria
- \`POST /ai/summarize\` with a valid \`encounterId\` returns a structured AI summary
- The summary is stored in the encounter's \`aiSummary\` field
- If \`GEMINI_API_KEY\` is not set, the endpoint returns \`503 { error: 'AIServiceUnavailable' }\`"

gh issue create --repo "$REPO" \
  --title "No WebSocket / real-time updates" \
  --label "enhancement" \
  --body "**Branch:** \`feat/websocket-realtime-updates\`
**Timeframe:** 5 days

## Description
In a clinical setting, real-time updates are important: a nurse updating a patient's vitals should be visible to the attending doctor immediately without a page refresh.

## Tasks
- Install \`socket.io\` in the API and \`socket.io-client\` in the web app
- Create \`apps/api/src/realtime/socket.ts\` initialising a Socket.IO server
- Implement rooms scoped by \`clinicId\`
- Emit events on: patient created/updated, encounter created/updated, payment confirmed
- Authenticate Socket.IO connections using the JWT access token

## Acceptance Criteria
- Creating a patient in one browser tab causes the patient list to update in another tab without a page refresh
- Socket.IO connections are authenticated — unauthenticated connections are rejected
- Events are scoped to the correct clinic"

gh issue create --repo "$REPO" \
  --title "No Stellar mainnet safety checks" \
  --label "security" \
  --body "**Branch:** \`feat/stellar-mainnet-safety-checks\`
**Timeframe:** 1 day

## Description
The stellar-service can be switched to mainnet by setting \`STELLAR_NETWORK=mainnet\`. There are no safety checks. A misconfiguration could result in real XLM being sent from the platform account.

## Tasks
- Add a startup check: if \`STELLAR_NETWORK=mainnet\`, log a prominent warning
- Add a \`STELLAR_MAINNET_CONFIRMED=true\` env var that must be explicitly set to allow mainnet operation
- Add transaction amount limits: reject any single transaction above \`STELLAR_MAX_TRANSACTION_XLM\`
- Disable the \`/fund\` (friendbot) endpoint entirely when \`STELLAR_NETWORK=mainnet\`
- Add a dry-run mode: \`STELLAR_DRY_RUN=true\`

## Acceptance Criteria
- Starting stellar-service with \`STELLAR_NETWORK=mainnet\` without \`STELLAR_MAINNET_CONFIRMED=true\` exits with code 1
- \`POST /fund\` returns \`403\` when \`STELLAR_NETWORK=mainnet\`
- A transaction above \`STELLAR_MAX_TRANSACTION_XLM\` returns \`400 { error: 'TransactionLimitExceeded' }\`"

gh issue create --repo "$REPO" \
  --title "No multi-currency support — only XLM payments" \
  --label "enhancement" \
  --body "**Branch:** \`feat/multi-currency-stellar-payments\`
**Timeframe:** 2 days

## Description
The payment system only supports XLM. Real healthcare payments involve local fiat currencies. Stellar supports custom assets (stablecoins like USDC on Stellar). Limiting to XLM makes the payment system impractical for real-world healthcare billing.

## Tasks
- Update \`POST /payments/intent\` to accept \`assetCode\` and \`issuer\` fields
- Add supported assets configuration: \`SUPPORTED_ASSETS\` env var
- Validate that the requested asset is in the supported list
- Update \`PaymentRecordModel\` to store \`assetCode\` and \`assetIssuer\`

## Acceptance Criteria
- \`POST /payments/intent\` with \`{ amount: '10', assetCode: 'USDC', issuer: 'G...' }\` creates a USDC payment intent
- Requesting an unsupported asset returns \`400 { error: 'UnsupportedAsset' }\`
- XLM (native) remains supported with no \`issuer\` required"

gh issue create --repo "$REPO" \
  --title "No patient appointment / scheduling module" \
  --label "enhancement" \
  --body "**Branch:** \`feat/appointment-scheduling-module\`
**Timeframe:** 5 days

## Description
The README describes a full EMR but there is no appointment scheduling. Clinics need to book, reschedule, and cancel patient appointments.

## Tasks
- Create \`appointment.model.ts\` with fields: \`patientId\`, \`clinicId\`, \`doctorId\`, \`scheduledAt\`, \`durationMinutes\`, \`status\`, \`reason\`, \`notes\`
- Implement CRUD endpoints: \`POST /appointments\`, \`GET /appointments\`, \`GET /appointments/:id\`, \`PATCH /appointments/:id\`, \`DELETE /appointments/:id\`
- Add conflict detection: prevent double-booking a doctor at the same time slot
- Add \`GET /appointments/availability?doctorId=&date=\`

## Acceptance Criteria
- \`POST /appointments\` creates an appointment and returns \`201\`
- Booking a doctor at an already-occupied time slot returns \`409 { error: 'TimeSlotUnavailable' }\`
- Appointments are scoped to the clinic"

gh issue create --repo "$REPO" \
  --title "No email notification system" \
  --label "enhancement" \
  --body "**Branch:** \`feat/email-notification-system\`
**Timeframe:** 5 days

## Description
The application has no email sending capability. Critical notifications are missing: password reset emails, appointment reminders, payment receipts, and account lockout notifications.

## Tasks
- Install \`nodemailer\` and create \`apps/api/src/utils/mailer.ts\`
- Add \`SMTP_HOST\`, \`SMTP_PORT\`, \`SMTP_USER\`, \`SMTP_PASS\`, \`EMAIL_FROM\` to \`.env.example\`
- Create email templates for: password reset, appointment reminder, payment receipt, account locked
- Implement the password reset email in \`POST /auth/forgot-password\`
- Use a queue (Bull/BullMQ with Redis) for email sending

## Acceptance Criteria
- \`POST /auth/forgot-password\` sends a password reset email within 30 seconds
- The reset link is valid for 1 hour and single-use
- Email sending failures are logged but do not cause the originating request to fail"

gh issue create --repo "$REPO" \
  --title "No image or file upload support for patient documents" \
  --label "enhancement" \
  --body "**Branch:** \`feat/document-file-upload-s3\`
**Timeframe:** 5 days

## Description
A real EMR needs to store patient documents: lab results, referral letters, consent forms, and medical images. There is no file upload endpoint, no storage integration, and no document model.

## Tasks
- Create \`document.model.ts\` with fields: \`patientId\`, \`clinicId\`, \`uploadedBy\`, \`fileName\`, \`mimeType\`, \`sizeBytes\`, \`storageKey\`, \`documentType\`
- Implement \`POST /api/v1/documents/upload\` using \`multer\`
- Store files in AWS S3 (or local disk for development)
- Implement \`GET /api/v1/documents/:id/download\` that generates a pre-signed S3 URL (valid for 15 minutes)
- Enforce file type validation (allow: PDF, JPEG, PNG, DICOM) and size limit (max 20MB)

## Acceptance Criteria
- \`POST /documents/upload\` with a valid PDF returns \`201\` with the document metadata
- \`GET /documents/:id/download\` returns a pre-signed URL that expires in 15 minutes
- Uploading a \`.exe\` file returns \`400 { error: 'InvalidFileType' }\`
- Uploading a file over 20MB returns \`413\`"
