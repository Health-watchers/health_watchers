# Implementation Plan: Patient Communication Log

## Overview

Implement the patient communication log end-to-end: MongoDB model, four API endpoints (log, list, send-sms stub, send-whatsapp stub), audit log extension, PDF export extension, and a communication timeline tab with a manual log form on the patient detail page.

## Tasks

- [ ] 1. Extend audit model with new action types
  - [ ] 1.1 Add `COMMUNICATION_LOG_CREATED` and `COMMUNICATION_LOG_VIEWED` to the `AuditAction` union type and enum array in `apps/api/src/modules/audit/audit.model.ts`
    - _Requirements: 10.1, 10.2_

- [ ] 2. Implement the CommunicationLog data model
  - [ ] 2.1 Create `apps/api/src/modules/communications/communication-log.model.ts` with the `ICommunicationLog` interface, `CommunicationChannel`, `CommunicationDirection`, and `CommunicationStatus` type aliases, and the Mongoose schema including all fields from Requirements 1.1–1.12, compound indexes `{ patientId, clinicId, sentAt: -1 }`, `{ clinicId }`, and `{ patientId, channel }`
    - _Requirements: 1.1–1.12_
  - [ ]* 2.2 Write property test for invalid enum value rejection on the model
    - **Property 2: Invalid enum value rejection**
    - **Validates: Requirements 1.4, 1.5, 1.7**

- [ ] 3. Implement communication validation schemas
  - [ ] 3.1 Create `apps/api/src/modules/communications/communication.validation.ts` with Zod schemas for: the log request body (`channel`, `direction`, `content`, `status`, `sentAt`, optional `relatedEncounterId` and `twilioMessageSid`), and the list query (`page`, `limit`, optional `channel`, optional `direction`)
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 3.3, 3.5, 3.6_
  - [ ]* 3.2 Write property test for validation schema rejection of invalid enum values
    - **Property 2: Invalid enum value rejection**
    - **Validates: Requirements 2.4, 2.5, 2.6**

- [ ] 4. Implement communication service
  - [ ] 4.1 Create `apps/api/src/modules/communications/communication.service.ts` with `logCommunication(patientId, params, user)`: verify patient exists and belongs to `user.clinicId` (return 404 if not), create `CommunicationLogModel` document with `sentBy: user._id` and `clinicId: user.clinicId` (ignoring any client-provided values), call `auditLog` with action `COMMUNICATION_LOG_CREATED` and metadata `{ resourceId, patientId, clinicId }` — omitting `content`
    - _Requirements: 2.1, 2.2, 2.7, 2.8, 10.1_
  - [ ]* 4.2 Write property test for communication log round-trip field completeness
    - **Property 1: Communication log round-trip field completeness**
    - **Validates: Requirements 1.1–1.12, 2.1, 2.7, 2.8**
  - [ ]* 4.3 Write property test for server-side field override
    - **Property 3: Server-side field override**
    - **Validates: Requirements 2.7, 2.8**
  - [ ]* 4.4 Write property test for clinic isolation on log
    - **Property 4: Clinic isolation**
    - **Validates: Requirements 2.2, 9.3**
  - [ ] 4.5 Add `listCommunications(patientId, clinicId, query)` to the service: verify patient belongs to clinic (return 404 if not), build filter `{ patientId, clinicId }` with optional `channel` and `direction` filters, call `paginate(CommunicationLogModel, filter, page, limit, { sentAt: -1 })`, call `auditLog` with action `COMMUNICATION_LOG_VIEWED` and metadata `{ patientId, clinicId }` — omitting content
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 10.2_
  - [ ]* 4.6 Write property test for pagination invariant
    - **Property 6: Pagination invariant**
    - **Validates: Requirements 3.3, 3.7**
  - [ ]* 4.7 Write property test for sort order invariant
    - **Property 7: Sort order invariant**
    - **Validates: Requirements 3.4**
  - [ ]* 4.8 Write property test for filter correctness
    - **Property 8: Filter correctness**
    - **Validates: Requirements 3.5, 3.6**
  - [ ]* 4.9 Write property test for audit log privacy invariant
    - **Property 10: Audit log privacy invariant**
    - **Validates: Requirements 10.1, 10.2**

- [ ] 5. Checkpoint — Ensure all service-layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement the communications controller and wire routes
  - [ ] 6.1 Create `apps/api/src/modules/communications/communications.controller.ts` with an Express Router implementing all four endpoints:
    - `POST /api/v1/patients/:id/communications` — apply `authenticate`, `requireRoles('DOCTOR','NURSE','CLINIC_ADMIN')`, `validate(logBodySchema)`, call `communicationService.logCommunication`, return 201
    - `GET /api/v1/patients/:id/communications` — apply `authenticate`, `requireRoles(...)`, `validate(listQuerySchema)`, call `communicationService.listCommunications`, return 200 with `{ status: 'success', data, meta }`
    - `POST /api/v1/patients/:id/send-sms` — apply `authenticate`, `requireRoles(...)`, return 501 with `{ status: 'error', message: 'SMS sending is not yet configured. Please configure Twilio to enable this feature.' }`
    - `POST /api/v1/patients/:id/send-whatsapp` — apply `authenticate`, `requireRoles(...)`, return 501 with `{ status: 'error', message: 'WhatsApp sending is not yet configured. Please configure Twilio to enable this feature.' }`
    - _Requirements: 2.1, 2.9, 3.1, 3.8, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_
  - [ ]* 6.2 Write property test for role enforcement across all four endpoints
    - **Property 5: Role enforcement**
    - **Validates: Requirements 2.9, 3.8, 4.2, 5.2, 9.1, 9.2**
  - [ ]* 6.3 Write property test for stub endpoints returning 501 with no side effects
    - **Property 9: Stub endpoints return 501 with no side effects**
    - **Validates: Requirements 4.1, 4.3, 5.1, 5.3**
  - [ ] 6.4 Register `communicationRoutes` in `apps/api/src/app.ts` at `/api/v1/patients`
    - _Requirements: 2.1, 3.1, 4.1, 5.1_

- [ ] 7. Checkpoint — Ensure all API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Extend PDF export with communication history
  - [ ] 8.1 Update `buildPatientRecord` in `apps/api/src/modules/export/export.service.ts` to query `CommunicationLogModel.find({ patientId }).sort({ sentAt: -1 }).lean()` and include the results as `communications` in the returned record
    - _Requirements: 8.1_
  - [ ] 8.2 Update `sendPatientPdf` in `apps/api/src/modules/export/export.service.ts` to render a "Communication History" section after the Payments section: iterate over `communications`, rendering `sentAt`, `channel`, `direction`, `status`, and `content` for each entry; display "No communications on record." when the array is empty
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ]* 8.3 Write property test for PDF export communication history completeness
    - **Property 11: PDF export communication history completeness**
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [ ] 9. Implement frontend API client and query hooks
  - [ ] 9.1 Add `communications` key to `apps/web/src/lib/queryKeys.ts`: `byPatient(patientId)` with optional filter params
    - _Requirements: 6.2, 7.3_
  - [ ] 9.2 Create `apps/web/src/lib/queries/communications.ts` with:
    - `usePatientCommunications(patientId, query?)` — React Query `useQuery` calling `GET /api/v1/patients/:id/communications`
    - `useLogCommunication()` — `useMutation` posting JSON to `POST /api/v1/patients/:id/communications`, invalidates patient communications query on success
    - _Requirements: 6.2, 6.5, 7.3_

- [ ] 10. Implement frontend communication components
  - [ ] 10.1 Create `apps/web/src/components/patients/communications/CommunicationEntry.tsx`: renders a single communication event card showing `channel` (with icon), `direction` badge, `status` badge, formatted `sentAt`, and a truncated `content` preview (max 120 characters with expand toggle)
    - _Requirements: 6.2_
  - [ ] 10.2 Create `apps/web/src/components/patients/communications/LogCommunicationForm.tsx`: modal form with controlled inputs for `channel` (select), `direction` (select), `content` (textarea, required), `status` (select), `sentAt` (datetime-local input, required), and optional `relatedEncounterId` (text input); client-side validation that all required fields are non-empty before calling `useLogCommunication`; inline error display on validation failure or server error; closes modal and resets form on success
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [ ]* 10.3 Write unit tests for LogCommunicationForm client-side validation
    - **Property 12: Form validation prevents invalid submissions**
    - **Validates: Requirements 7.3, 7.4**
  - [ ] 10.4 Create `apps/web/src/components/patients/communications/CommunicationTimeline.tsx`: renders the "Communications" tab content using `usePatientCommunications`; shows loading skeleton while fetching; shows empty state message when `data.length === 0`; renders a list of `CommunicationEntry` components; shows a "Load more" button when `data.length < meta.total` that increments the page; renders a "Log Communication" button that opens `LogCommunicationForm` modal
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1_
  - [ ]* 10.5 Write unit tests for CommunicationTimeline rendering states
    - Test loading state, empty state, populated state, and load more behavior
    - _Requirements: 6.3, 6.4, 6.5_

- [ ] 11. Integrate CommunicationTimeline into patient detail page
  - [ ] 11.1 Update `apps/web/src/app/patients/[id]/PatientDetailClient.tsx` to import `CommunicationTimeline` and add a "Communications" tab to the existing tab navigation, rendering `CommunicationTimeline` with the patient ID when the tab is active
    - _Requirements: 6.1, 9.1, 9.2, 9.3_

- [ ] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- `sentBy` and `clinicId` must always be set server-side from the authenticated user — never trust client-provided values for these fields
- The `content` field must never appear in audit log `metadata` — this is a privacy requirement
- Property tests use `fast-check` (add as dev dependency: `npm install --save-dev fast-check` in `apps/api`)
- The Twilio send endpoints are intentional stubs — do not implement actual Twilio API calls until the integration is configured
- The `paginate` utility in `apps/api/src/utils/paginate.ts` is already used by the encounters module and should be reused here
- Clinic isolation is enforced by always including `clinicId` in the patient lookup query, not as a separate check
