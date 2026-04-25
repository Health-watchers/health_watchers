# Requirements Document

## Introduction

This feature adds encounter outcome tracking and follow-up management to the Health Watchers platform. After an encounter is closed, doctors need to record what happened to the patient (did they improve? were they hospitalized?), whether a follow-up is required, and whether the patient adhered to the treatment plan. The system must surface overdue follow-ups in a queue, send daily reminders to doctors and patients, link follow-up encounters back to the originating encounter, and expose outcome analytics for quality improvement.

## Glossary

- **Encounter**: An existing clinical record in the system representing a patient visit, stored in the `Encounter` collection.
- **Outcome**: A structured record of the patient's clinical result after an encounter, including status, notes, adherence, and follow-up details.
- **Outcome_Status**: One of `improved`, `unchanged`, `worsened`, `resolved`, `referred`, or `hospitalized`.
- **Adherence_Status**: One of `full`, `partial`, `none`, or `unknown`, representing how well the patient followed the treatment plan.
- **Follow_Up_Queue**: The ordered list of encounters where `followUpRequired` is `true` and `followUpDate` is on or before today.
- **Reminder_Job**: A scheduled background process that runs once per day and dispatches follow-up reminder notifications.
- **Outcome_Analytics**: Aggregated statistics over encounter outcomes for a clinic, including outcome distribution, follow-up compliance rate, and average time to resolution.
- **Clinic_Admin**: A user with the `CLINIC_ADMIN` role.
- **Doctor**: A user with the `DOCTOR` role.
- **Patient_User**: A user with the `PATIENT` role whose `patientId` links to a `Patient` document.

---

## Requirements

### Requirement 1: Outcome Fields on the Encounter Model

**User Story:** As a doctor, I want to record the outcome of an encounter, so that I can document what happened to the patient after treatment.

#### Acceptance Criteria

1. THE Encounter SHALL include an `outcome` field that accepts exactly one of the values: `improved`, `unchanged`, `worsened`, `resolved`, `referred`, or `hospitalized`.
2. THE Encounter SHALL include an `outcomeNotes` field that accepts a free-text string of up to 2000 characters.
3. THE Encounter SHALL include a `followUpRequired` boolean field that defaults to `false`.
4. THE Encounter SHALL include a `followUpDate` date field that is required when `followUpRequired` is `true`.
5. THE Encounter SHALL include a `followUpCompleted` boolean field that defaults to `false`.
6. THE Encounter SHALL include a `followUpEncounterId` field that stores a reference to another Encounter document.
7. THE Encounter SHALL include a `patientAdherence` field that accepts exactly one of the values: `full`, `partial`, `none`, or `unknown`.
8. IF `followUpRequired` is `true` and `followUpDate` is absent, THEN THE System SHALL reject the request with a 400 status and a descriptive error message.
9. IF `followUpEncounterId` is provided, THEN THE System SHALL verify the referenced encounter belongs to the same clinic before saving, and return a 400 error if it does not.

---

### Requirement 2: Outcome Recording Endpoint

**User Story:** As a doctor, I want a dedicated endpoint to record or update the outcome of an encounter, so that outcome data is captured consistently without overwriting other encounter fields.

#### Acceptance Criteria

1. WHEN a `PUT /api/v1/encounters/:id/outcome` request is received, THE Outcome_Recorder SHALL update only the outcome-related fields (`outcome`, `outcomeNotes`, `followUpRequired`, `followUpDate`, `followUpCompleted`, `followUpEncounterId`, `patientAdherence`) on the specified encounter.
2. WHEN the outcome is recorded, THE Outcome_Recorder SHALL require the requesting user to have the `DOCTOR` or `CLINIC_ADMIN` role.
3. WHEN a `DOCTOR` records an outcome, THE Outcome_Recorder SHALL verify the encounter belongs to the authenticated clinic before updating.
4. IF the encounter does not exist or does not belong to the authenticated clinic, THEN THE Outcome_Recorder SHALL return a 404 response.
5. IF the encounter has status `cancelled`, THEN THE Outcome_Recorder SHALL return a 409 response with a message indicating the encounter cannot be updated.
6. WHEN the outcome is successfully recorded, THE Outcome_Recorder SHALL return the full updated encounter in the response body.
7. WHEN `followUpRequired` is set to `true` without a `followUpDate`, THE Outcome_Recorder SHALL return a 400 response.

---

### Requirement 3: Follow-Up Queue Endpoint

**User Story:** As a doctor, I want to see a list of overdue or due follow-ups, so that I can prioritize patients who need attention.

#### Acceptance Criteria

1. WHEN a `GET /api/v1/encounters/follow-ups-due` request is received, THE Follow_Up_Queue SHALL return all encounters where `followUpRequired` is `true`, `followUpCompleted` is `false`, and `followUpDate` is on or before the current date, scoped to the authenticated clinic.
2. THE Follow_Up_Queue SHALL sort results by `followUpDate` ascending (most overdue first).
3. WHEN a `doctorId` query parameter is provided, THE Follow_Up_Queue SHALL filter results to encounters where `attendingDoctorId` matches the provided value.
4. WHEN a `patientId` query parameter is provided, THE Follow_Up_Queue SHALL filter results to encounters where `patientId` matches the provided value.
5. WHEN `from` and `to` date query parameters are provided, THE Follow_Up_Queue SHALL filter results to encounters where `followUpDate` falls within the inclusive date range.
6. THE Follow_Up_Queue SHALL require the requesting user to have the `DOCTOR`, `NURSE`, or `CLINIC_ADMIN` role.
7. THE Follow_Up_Queue SHALL support `page` and `limit` query parameters for pagination, with a default limit of 20 and a maximum of 100.

---

### Requirement 4: Follow-Up Reminder Job

**User Story:** As a doctor, I want to receive a daily reminder about upcoming follow-ups, so that I do not miss patients who need to be seen.

#### Acceptance Criteria

1. THE Reminder_Job SHALL run once per day at a configurable time (defaulting to 08:00 UTC).
2. WHEN the Reminder_Job runs, THE Reminder_Job SHALL find all encounters where `followUpRequired` is `true`, `followUpCompleted` is `false`, and `followUpDate` is exactly one calendar day in the future (tomorrow).
3. WHEN a matching encounter is found, THE Reminder_Job SHALL create an in-app notification for the attending doctor using the existing `createNotification` service with type `follow_up_reminder`.
4. WHEN a matching encounter is found and the patient has a linked `Patient_User` account with `emailNotifications` enabled, THE Reminder_Job SHALL send a follow-up appointment reminder email to that patient user.
5. WHEN a matching encounter is found and the patient has a `contactNumber` on file, THE Reminder_Job SHALL include the patient contact number in the notification metadata for future SMS integration.
6. IF the Reminder_Job encounters an error processing a single encounter, THEN THE Reminder_Job SHALL log the error and continue processing remaining encounters without stopping.
7. THE Reminder_Job SHALL be startable and stoppable via exported `startFollowUpReminderJob` and `stopFollowUpReminderJob` functions, following the same pattern as the existing payment expiration job.
8. THE Reminder_Job SHALL be started during server startup in `app.ts`.

---

### Requirement 5: Doctor Dashboard Follow-Up Queue Widget

**User Story:** As a doctor, I want to see my overdue follow-ups on the dashboard, so that I have immediate visibility into patients requiring attention when I log in.

#### Acceptance Criteria

1. WHEN a `GET /api/v1/dashboard/stats` request is received from a user with the `DOCTOR` role, THE Dashboard SHALL include a `followUpsDue` array in the response containing up to 5 of the most overdue follow-up encounters assigned to that doctor.
2. WHEN a `GET /api/v1/dashboard/stats` request is received from a user with the `CLINIC_ADMIN` role, THE Dashboard SHALL include a `followUpsDue` array containing up to 5 of the most overdue follow-up encounters across the entire clinic.
3. THE Dashboard SHALL include a `followUpsDueCount` integer in the response representing the total number of overdue follow-ups visible to the requesting user.
4. WHEN there are no overdue follow-ups, THE Dashboard SHALL return an empty `followUpsDue` array and a `followUpsDueCount` of `0`.

---

### Requirement 6: Outcome History on Patient Detail

**User Story:** As a doctor, I want to see the outcome history for a patient across all their encounters, so that I can understand the patient's clinical trajectory over time.

#### Acceptance Criteria

1. WHEN a `GET /api/v1/encounters/patient/:patientId` request is received, THE Encounter_List SHALL include the outcome fields (`outcome`, `outcomeNotes`, `followUpRequired`, `followUpDate`, `followUpCompleted`, `followUpEncounterId`, `patientAdherence`) in each encounter response object where those fields are set.
2. THE Encounter_List SHALL include encounters regardless of whether outcome fields are populated, preserving existing behavior for encounters without outcomes.

---

### Requirement 7: Outcome Analytics Endpoint

**User Story:** As a clinic administrator, I want to view outcome analytics, so that I can assess care quality and identify areas for improvement.

#### Acceptance Criteria

1. WHEN a `GET /api/v1/reports/outcomes` request is received, THE Outcome_Analytics SHALL return outcome distribution counts for each `Outcome_Status` value scoped to the authenticated clinic.
2. THE Outcome_Analytics SHALL return a `followUpComplianceRate` expressed as a percentage (0–100), calculated as the number of encounters where `followUpCompleted` is `true` divided by the total number of encounters where `followUpRequired` is `true`.
3. THE Outcome_Analytics SHALL return an `avgDaysToResolution` value representing the average number of days between `createdAt` and `followUpDate` for encounters with `outcome` of `resolved`.
4. WHEN `from` and `to` date query parameters are provided, THE Outcome_Analytics SHALL filter all calculations to encounters created within the inclusive date range.
5. THE Outcome_Analytics SHALL require the requesting user to have the `CLINIC_ADMIN` or `SUPER_ADMIN` role.
6. IF no encounters match the filter, THE Outcome_Analytics SHALL return zero counts and `null` for `avgDaysToResolution`.

---

### Requirement 8: Notification Type Extension

**User Story:** As a developer, I want the notification system to support follow-up reminder notifications, so that doctors receive in-app alerts about due follow-ups.

#### Acceptance Criteria

1. THE Notification_System SHALL add `follow_up_reminder` to the list of valid `NotificationType` values in `notification.model.ts`.
2. THE Notification_System SHALL add `follow_up_reminder` to the `notificationTypes` preference map in `user.model.ts` with a default value of `true`.
3. WHEN a `follow_up_reminder` notification is created, THE Notification_System SHALL respect the user's `follow_up_reminder` preference in `notificationTypes` before delivering the notification, consistent with existing notification type filtering.
