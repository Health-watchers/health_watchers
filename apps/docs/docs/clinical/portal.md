---
title: Patient Portal
description: "The patient-facing API used by `apps/web/src/app/portal` and the mobile app."
---

# Patient Portal

The patient-facing API used by `apps/web/src/app/portal` and the mobile app. Patients sign in with their own credentials (and MFA), then view appointments, encounters, invoices and timeline, pay invoices, message the care team, add notes to encounters, and manage waitlist entries.

| | |
|---|---|
| **Base path** | `/api/v1/portal` |
| **Source** | [`apps/api/src/modules/portal/portal.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/portal/portal.controller.ts) |

## Data model

The portal reuses the clinical models (`Patient`, `Appointment`, `Encounter`, `Invoice`). It adds:

| Model | File | Purpose |
|-------|------|---------|
| `PortalMessage` | `models/portal-message.model.ts` | Patient ↔ care-team messages. `senderRole` is one of `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT`, `READ_ONLY`, `PATIENT` |
| `User` (role `PATIENT`) | `auth/models/user.model.ts` | Portal account linked to a patient through `patientId`, with its own portal MFA fields |

## Authentication

`POST /portal/auth/login` issues a portal session for a `PATIENT` user. If MFA is enabled, the patient then completes `POST /portal/auth/mfa/verify-login`. Every other portal route requires the `PATIENT` role (`requirePatient`), and handlers only return records belonging to the caller's own `patientId`.

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/portal/auth/login` | Public |
| `POST` | `/api/v1/portal/auth/mfa/verify-login` | Public |
| `GET` | `/api/v1/portal/me` | `PATIENT` |
| `GET` | `/api/v1/portal/appointments` | `PATIENT` |
| `GET` | `/api/v1/portal/invoices` | `PATIENT` |
| `POST` | `/api/v1/portal/invoices/:id/pay` | `PATIENT` |
| `POST` | `/api/v1/portal/messages` | `PATIENT` |
| `GET` | `/api/v1/portal/messages` | `PATIENT` |
| `GET` | `/api/v1/portal/waitlist/position` | `PATIENT` |
| `POST` | `/api/v1/portal/waitlist` | `PATIENT` |
| `DELETE` | `/api/v1/portal/waitlist/:id` | `PATIENT` |
| `GET` | `/api/v1/portal/encounters` | `PATIENT` |
| `POST` | `/api/v1/portal/encounters/:id/notes` | `PATIENT` |
| `GET` | `/api/v1/portal/appointments/history` | `PATIENT` |
| `GET` | `/api/v1/portal/timeline` | `PATIENT` |

## Roles

Roles referenced by this module: `PATIENT`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Health Log](/clinical/health-log)
- [Medication History](/clinical/medications)
- [Care Team Inbox](/clinical/inbox)
- [Invoices](/payments/invoices)
