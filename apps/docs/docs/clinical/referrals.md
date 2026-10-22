---
title: Referrals
description: "Clinic-to-clinic and provider-to-provider referrals with accept/decline, controlled sharing of patient data, outcome tracking, and referral analytics."
---

# Referrals

Clinic-to-clinic and provider-to-provider referrals with accept/decline, controlled sharing of patient data, outcome tracking, and referral analytics.

| | |
|---|---|
| **Base path** | `/api/v1/referrals` |
| **Source** | [`apps/api/src/modules/referrals/referrals.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/referrals/referrals.controller.ts) |

## Data model

- Referral (`referral.model.ts`): `fromClinicId`, `toClinicId`, `referredBy`, `patientId`, `encounterId`, `reason`, `urgency`, status, `acceptedBy`/`acceptedAt`, `declinedReason`, shared data (`demographics`, `encounters`, `labResults`, `prescriptions`), `outcomeNotes`, `outcomeDate`

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/referrals` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/referrals/outgoing` | Authenticated |
| `GET` | `/api/v1/referrals/incoming` | Authenticated |
| `PUT` | `/api/v1/referrals/:id/accept` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PUT` | `/api/v1/referrals/:id/decline` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/referrals/:id/patient-data` | Authenticated |
| `PATCH` | `/api/v1/referrals/:id/outcome` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/referrals/analytics` | `CLINIC_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
