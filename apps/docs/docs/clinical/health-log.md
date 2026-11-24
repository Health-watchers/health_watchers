---
title: Health Log
description: "Patient-recorded health measurements (weight, blood pressure, blood glucose, heart rate, exercise minutes) entered from the portal and visible to the care team."
---

# Health Log

Patient-recorded health measurements (weight, blood pressure, blood glucose, heart rate, exercise minutes) entered from the portal and visible to the care team.

| | |
|---|---|
| **Base path** | `/api/v1/portal/health-log, /api/v1/patients/health-log, /api/v1/patients/:id/health-log` |
| **Source** | [`apps/api/src/modules/health-log/health-log.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/health-log/health-log.controller.ts) |

## Data model

- HealthLog (`health-log.model.ts`): `patientId`, type (`weight`, `blood_pressure`, `blood_glucose`, `exercise_minutes`, `heart_rate`), `value`, `unit`, `notes`, `loggedAt`, `flagged`

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/patients/:id/health-log` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/portal/health-log` | `PATIENT` |
| `GET` | `/api/v1/portal/health-log` | `PATIENT` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `PATIENT`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Patient Portal](/clinical/portal)
