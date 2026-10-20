---
title: Appointments
description: "Scheduling of patient visits, including doctor availability, check-in (staff or QR-token self check-in), telemedicine video rooms, bulk reschedule/cancel, and the waitlist."
---

# Appointments

Scheduling of patient visits, including doctor availability, check-in (staff or QR-token self check-in), telemedicine video rooms, bulk reschedule/cancel, and the waitlist.

| | |
|---|---|
| **Base path** | `/api/v1/appointments` |
| **Source** | [`apps/api/src/modules/appointments/appointments.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/appointments/appointments.controller.ts)<br/>[`apps/api/src/modules/appointments/waitlist.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/appointments/waitlist.controller.ts)<br/>[`apps/api/src/routes/v2/appointments.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/routes/v2/appointments.routes.ts) |

## Data model

`Appointment` (`appointment.model.ts`):

| Field | Type | Notes |
|-------|------|-------|
| `patientId`, `doctorId`, `clinicId` | ObjectId | |
| `scheduledAt` | Date | Required |
| `duration` | number | Minutes, default `30` (clinic default is set during onboarding) |
| `type` | enum | `consultation`, `follow-up`, `procedure`, `emergency` |
| `status` | enum | `scheduled`, `confirmed`, `cancelled`, `completed`, `no-show`, `patient_arrived` |
| `chiefComplaint`, `notes` | string | |
| `encounterId` | ObjectId → `Encounter` | Set when the visit is documented |
| `cancelledBy`, `cancelledAt`, `cancellationReason` | | Cancellation audit |
| `checkedInAt` | Date | |
| `isTelemedicine`, `videoRoomId`, `videoRoomUrl`, `videoProvider`, `recordingConsent` | | Telemedicine fields |
| `reminderSent24h`, `reminderSent1h` | boolean | Set by the reminder job |

`Waitlist` (`waitlist.model.ts`) holds patients waiting for an earlier slot.

## Access rules

Appointment routes require authentication, and handlers scope results by role. A `PATIENT` caller only ever sees their own appointments (`patientId` is forced to the caller). Other roles can filter by `doctorId` or `patientId` within their clinic.

A v2 version of the core CRUD endpoints is mounted at `/api/v2/appointments` with the v2 response envelope.

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/appointments/:id/check-in` | Authenticated |
| `GET` | `/api/v1/appointments/doctor/:doctorId/availability` | Authenticated |
| `GET` | `/api/v1/appointments` | Authenticated |
| `GET` | `/api/v1/appointments/:id` | Authenticated |
| `POST` | `/api/v1/appointments` | Authenticated |
| `PUT` | `/api/v1/appointments/:id` | Authenticated |
| `DELETE` | `/api/v1/appointments/:id` | Authenticated |
| `POST` | `/api/v1/appointments/:id/video-room` | Authenticated |
| `GET` | `/api/v1/appointments/:id/video-token` | Authenticated |
| `POST` | `/api/v1/appointments/:id/video/start` | Authenticated |
| `POST` | `/api/v1/appointments/:id/video/end` | Authenticated |
| `POST` | `/api/v1/appointments/bulk` | Authenticated |
| `POST` | `/api/v1/appointments/check-in/:token` | Authenticated |
| `POST` | `/api/v1/waitlist` | Authenticated |
| `GET` | `/api/v1/waitlist` | `CLINIC_ADMIN`, `SUPER_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT` |
| `GET` | `/api/v1/waitlist/position` | Authenticated |
| `DELETE` | `/api/v1/waitlist/:id` | Authenticated |
| `POST` | `/api/v2/appointments/:id/check-in` | Authenticated |
| `GET` | `/api/v2/appointments` | Authenticated |
| `PUT` | `/api/v2/appointments/:id` | Authenticated |
| `DELETE` | `/api/v2/appointments/:id` | Authenticated |
| `GET` | `/api/v2/appointments/doctor/:doctorId/availability` | Authenticated |
| `GET` | `/api/v2/appointments/:id` | Authenticated |
| `POST` | `/api/v2/appointments` | Authenticated |

## Roles

Roles referenced by this module: `ASSISTANT`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Encounters](/clinical/encounters)
- [Provider Scheduling](/clinical/provider-scheduling)
- [Telehealth](/clinical/telehealth)
