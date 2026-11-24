---
title: Care Plans
description: "Longitudinal care plans with goals and interventions, plus periodic clinician review."
---

# Care Plans

Longitudinal care plans with goals and interventions, plus periodic clinician review.

| | |
|---|---|
| **Base path** | `/api/v1/care-plans` |
| **Source** | [`apps/api/src/modules/care-plans/care-plans.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/care-plans/care-plans.controller.ts) |

## Data model

- CarePlan (`care-plan.model.ts`): `patientId`, `clinicId`, `condition`/`icdCode`, `goals` (`parameter`, `targetValue`, `targetRange`, `targetDate`), `interventions`, `monitoringSchedule`, `status`, `nextReviewDate`, `reviewHistory`, `aiGenerated`

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/care-plans` | Authenticated |
| `POST` | `/api/v1/care-plans` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/care-plans/:id` | Authenticated |
| `PUT` | `/api/v1/care-plans/:id` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/care-plans/:id/review` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [AI Features](/clinical/ai)
- [Patients](/clinical/patients)
