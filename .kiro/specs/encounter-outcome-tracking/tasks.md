# Implementation Plan: Encounter Outcome Tracking

## Overview

Implement encounter outcome tracking and follow-up management by extending the Encounter model, adding new endpoints, a daily reminder job, dashboard widget data, and an outcome analytics report. All changes are additive and backward-compatible.

## Tasks

- [ ] 1. Extend notification types for follow-up reminders
  - Add `'follow_up_reminder'` to `NOTIFICATION_TYPES` array in `apps/api/src/modules/notifications/notification.model.ts`
  - Add `follow_up_reminder` to the `UserPreferences.notificationTypes` interface in `apps/api/src/modules/auth/models/user.model.ts`
  - Add `follow_up_reminder: { type: Boolean, default: true }` to the `notificationTypes` sub-schema in the user schema
  - _Requirements: 8.1, 8.2, 8.3_

- [ ] 2. Extend the Encounter model with outcome fields
  - [ ] 2.1 Add outcome fields to the `Encounter` TypeScript interface and `encounterSchema` in `apps/api/src/modules/encounters/encounter.model.ts`
    - Fields: `outcome` (enum), `outcomeNotes` (string, max 2000), `followUpRequired` (boolean, default false), `followUpDate` (Date), `followUpCompleted` (boolean, default false), `followUpEncounterId` (ObjectId ref Encounter), `patientAdherence` (enum)
    - Add compound index: `{ clinicId: 1, followUpRequired: 1, followUpDate: 1, followUpCompleted: 1 }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ] 2.2 Extend `EncounterResponse` interface and `toEncounterResponse` transformer in `apps/api/src/modules/encounters/encounters.transformer.ts` to include all new outcome fields
    - _Requirements: 6.1, 6.2_

  - [ ]* 2.3 Write unit tests for the model defaults
    - Verify `followUpRequired` defaults to `false` and `followUpCompleted` defaults to `false` when not provided
    - _Requirements: 1.3, 1.5_

- [ ] 3. Add outcome validation schemas
  - [ ] 3.1 Add `recordOutcomeSchema` Zod schema to `apps/api/src/modules/encounters/encounter.validation.ts`
    - Include `.refine()` rule: `followUpRequired=true` requires `followUpDate`
    - _Requirements: 1.8, 2.7_

  - [ ] 3.2 Add `followUpQueueQuerySchema` Zod schema to `apps/api/src/modules/encounters/encounter.validation.ts`
    - Fields: `doctorId`, `patientId`, `from`, `to` (date strings), `page`, `limit`
    - _Requirements: 3.3, 3.4, 3.5, 3.7_

  - [ ]* 3.3 Write property test for `recordOutcomeSchema` validation
    - **Property 1: followUpDate required when followUpRequired is true** — for any payload with `followUpRequired=true` and no `followUpDate`, schema must return a validation error
    - **Property 2: followUpDate not required when followUpRequired is false** — for any payload with `followUpRequired=false`, schema must succeed regardless of `followUpDate`
    - **Property 3: Outcome enum enforcement** — for any string not in the valid outcome enum, schema must reject the `outcome` field
    - **Property 4: Adherence enum enforcement** — for any string not in the valid adherence enum, schema must reject the `patientAdherence` field
    - **Validates: Requirements 1.1, 1.4, 1.7, 1.8, 2.7**

- [ ] 4. Implement the outcome recording endpoint
  - [ ] 4.1 Add `PUT /api/v1/encounters/:id/outcome` route to `apps/api/src/modules/encounters/encounters.controller.ts`
    - Require roles: `DOCTOR`, `CLINIC_ADMIN`
    - Validate body with `recordOutcomeSchema`
    - Verify encounter exists and belongs to clinic (404 if not)
    - Reject `cancelled` encounters with 409
    - If `followUpEncounterId` provided, verify it belongs to same clinic (400 if not)
    - Use `$set` to update only outcome fields
    - Return updated encounter via `toEncounterResponse`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 4.2 Write property test for outcome field isolation
    - **Property 9: Outcome recording does not mutate non-outcome fields** — for any encounter and valid outcome payload, non-outcome fields must remain unchanged after a successful PUT
    - **Validates: Requirements 2.1**

  - [ ]* 4.3 Write unit tests for outcome endpoint error cases
    - 404 when encounter not found
    - 409 when encounter is cancelled
    - 400 when `followUpEncounterId` belongs to a different clinic
    - 403 when called without required role
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

- [ ] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement the follow-up queue endpoint
  - [ ] 6.1 Add `GET /api/v1/encounters/follow-ups-due` route to `apps/api/src/modules/encounters/encounters.controller.ts`
    - Note: register this route BEFORE the `/:id` route to avoid param capture
    - Require roles: `DOCTOR`, `NURSE`, `CLINIC_ADMIN`
    - Validate query with `followUpQueueQuerySchema`
    - Base filter: `{ clinicId, followUpRequired: true, followUpCompleted: false, followUpDate: { $lte: today } }`
    - Apply optional `doctorId`, `patientId`, and date range filters
    - Sort by `{ followUpDate: 1 }`, paginate
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 6.2 Write property tests for follow-up queue correctness
    - **Property 5: Follow-up queue only returns overdue, incomplete follow-ups** — for any encounter set, only encounters matching all three criteria appear in results
    - **Property 6: Follow-up queue is sorted ascending by followUpDate** — for any non-empty result, adjacent pairs satisfy `a.followUpDate <= b.followUpDate`
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 6.3 Write unit tests for follow-up queue filters
    - Verify `doctorId` filter, `patientId` filter, and date range filter each correctly narrow results
    - Verify role enforcement (403 for unauthorized roles)
    - _Requirements: 3.3, 3.4, 3.5, 3.6_

- [ ] 7. Implement the follow-up reminder job
  - [ ] 7.1 Create `apps/api/src/modules/encounters/follow-up-reminder-job.ts`
    - Implement `sendFollowUpReminders()` async function:
      - Compute tomorrow's date range
      - Query encounters matching `{ followUpRequired: true, followUpCompleted: false, followUpDate: { $gte: tomorrowStart, $lt: tomorrowEnd } }`
      - For each encounter: call `createNotification` for `attendingDoctorId` with type `follow_up_reminder`
      - Find `Patient_User` by `patientId` (role=PATIENT); if found and email notifications enabled, call `enqueue` with reminder email
      - If patient has `contactNumber`, include in notification metadata
      - Catch and log per-encounter errors, continue processing
    - Implement `startFollowUpReminderJob()` and `stopFollowUpReminderJob()` using `setInterval` scheduled to 08:00 UTC daily
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ] 7.2 Register the job in `apps/api/src/app.ts`
    - Import and call `startFollowUpReminderJob()` in `startServer()`
    - Call `stopFollowUpReminderJob()` in the graceful shutdown handler
    - _Requirements: 4.8_

  - [ ]* 7.3 Write property test for reminder job targeting
    - **Property 10: Reminder job processes all matching encounters and skips non-matching ones** — for any encounter set, the job sends notifications for exactly those with `followUpRequired=true`, `followUpCompleted=false`, and `followUpDate` in tomorrow's range
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 7.4 Write unit tests for reminder job edge cases
    - No matching encounters → no notifications sent
    - Patient without a user account → no email sent, no error thrown
    - Per-encounter error → job continues and processes remaining encounters
    - _Requirements: 4.4, 4.5, 4.6_

- [ ] 8. Extend the dashboard with follow-up queue data
  - [ ] 8.1 Update `apps/api/src/modules/dashboard/dashboard.controller.ts` to add follow-up queue data to the `getStats` response
    - For `DOCTOR` role: query up to 5 most overdue follow-ups for `attendingDoctorId === req.user.userId`
    - For `CLINIC_ADMIN`/`SUPER_ADMIN`: query up to 5 most overdue follow-ups across the clinic
    - Add `followUpsDue` array and `followUpsDueCount` integer to the response
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 8.2 Write unit tests for dashboard follow-up data
    - Verify `followUpsDue` contains at most 5 items
    - Verify `followUpsDueCount` matches total overdue count
    - Verify role-based filtering (DOCTOR sees only own, CLINIC_ADMIN sees all)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement the outcome analytics endpoint
  - [ ] 10.1 Add `GET /api/v1/reports/outcomes` route to `apps/api/src/modules/reports/reports.controller.ts`
    - Require roles: `CLINIC_ADMIN`, `SUPER_ADMIN` (already enforced by router middleware)
    - Accept optional `from`/`to` date query params
    - Use MongoDB aggregation to compute:
      - `outcomeDistribution`: `$group` by `outcome` field, count per value
      - `followUpComplianceRate`: count `followUpCompleted=true` / count `followUpRequired=true` × 100, or `null` if denominator is 0
      - `avgDaysToResolution`: average of `(followUpDate - createdAt)` in days for `outcome='resolved'` encounters, or `null` if none
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 10.2 Write property tests for analytics correctness
    - **Property 7: Follow-up compliance rate is bounded between 0 and 100** — for any encounter set, compliance rate is in `[0,100]` or `null`
    - **Property 8: Outcome distribution counts are non-negative and sum correctly** — sum of all distribution values equals total encounters with `outcome` field set
    - **Validates: Requirements 7.1, 7.2**

  - [ ]* 10.3 Write unit tests for analytics edge cases
    - No encounters with outcomes → all zeros, `null` for averages
    - All follow-ups completed → compliance rate = 100
    - No resolved encounters → `avgDaysToResolution` = null
    - Date range filter correctly scopes results
    - _Requirements: 7.3, 7.4, 7.6_

- [ ] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- The `follow-ups-due` route MUST be registered before `/:id` in the encounters router to avoid Express treating "follow-ups-due" as an encounter ID
- All new outcome fields are optional on the Mongoose schema — no migration needed for existing encounter documents
- Property tests use `fast-check` with a minimum of 100 runs; each test must include a comment: `// Feature: encounter-outcome-tracking, Property N: <property_text>`
- The reminder job uses `setInterval` with a computed initial delay to align to 08:00 UTC, matching the pattern in `payment-expiration-job.ts`
