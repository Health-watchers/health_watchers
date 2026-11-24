---
title: Medication History
description: "The patient-portal view of a patient's medications and refill history, built from encounter prescriptions."
---

# Medication History

The patient-portal view of a patient's medications and refill history, built from encounter prescriptions.

| | |
|---|---|
| **Base path** | `/api/v1/portal/medications` |
| **Source** | [`apps/api/src/modules/medications/medication-history.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/medications/medication-history.routes.ts) |

## Data model

- MedicationHistory (`medication-history.model.ts`): prescription refill events

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/portal/medications` | `PATIENT` |
| `GET` | `/api/v1/portal/medications/:prescriptionId/refill-history` | `PATIENT` |

## Roles

Roles referenced by this module: `PATIENT`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Patient Portal](/clinical/portal)
