---
title: Immunizations
description: "Vaccination records per patient, due/overdue schedules, printable and verifiable immunization certificates, vaccine lot inventory, adverse-event reporting, and lot recalls."
---

# Immunizations

Vaccination records per patient, due/overdue schedules, printable and verifiable immunization certificates, vaccine lot inventory, adverse-event reporting, and lot recalls.

| | |
|---|---|
| **Base path** | `/api/v1/patients/:id/immunizations, /api/v1/immunizations` |
| **Source** | [`apps/api/src/modules/immunizations/immunizations.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/immunizations/immunizations.controller.ts)<br/>[`apps/api/src/modules/immunizations/immunization-operations.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/immunizations/immunization-operations.controller.ts)<br/>[`apps/api/src/modules/immunizations/immunization-verify.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/immunizations/immunization-verify.routes.ts) |

## Data model

| Model | File | Purpose |
|-------|------|---------|
| `Immunization` | `immunization.model.ts` | One administered dose: `vaccineName`, `vaccineCode` (CVX), `manufacturer`, `lotNumber`, `administeredDate`, `expiryDate`, `doseNumber`, `seriesComplete`, `administeredBy`, `site`, `route`, optional `adverseReaction`, `isActive` |
| `VaccineLot` | `vaccine-lot.model.ts` | Lot inventory: receipt, stock adjustments, recall state |
| `AdverseEvent` | `adverse-event.model.ts` | Adverse events following immunization, including VAERS reporting status |
| `ImmunizationRecall` | `immunization-recall.model.ts` | Recall campaigns and the patients they affect |

## Certificates and public verification

`GET /patients/:id/immunizations/certificate` produces a certificate containing a verification token. Anyone holding the token can verify it without signing in at `GET /api/v1/verify/immunization/:token`.

## CVX codes

`/api/v1/immunizations/cvx` exposes the CVX vaccine code list used to validate `vaccineCode`.

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/patients/:id/immunizations` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/patients/:id/immunizations` | Authenticated |
| `GET` | `/api/v1/patients/:id/immunizations/due` | Authenticated |
| `GET` | `/api/v1/patients/:id/immunizations/certificate` | Authenticated |
| `GET` | `/api/v1/patients/:id/immunizations/:immunizationId` | Authenticated |
| `PUT` | `/api/v1/patients/:id/immunizations/:immunizationId` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `DELETE` | `/api/v1/patients/:id/immunizations/:immunizationId` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/patients/:id/immunizations/overdue` | `CLINIC_ADMIN`, `DOCTOR` |
| `GET` | `/api/v1/immunizations/cvx` | Authenticated |
| `POST` | `/api/v1/immunizations/conflicts/check` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/immunizations/immunity-status` | Authenticated |
| `GET` | `/api/v1/immunizations/analytics` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/immunizations/lots` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/immunizations/lots` | Authenticated |
| `GET` | `/api/v1/immunizations/lots/:id` | Authenticated |
| `POST` | `/api/v1/immunizations/lots/:id/receive` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/immunizations/lots/:id/adjust` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/immunizations/lots/:id/recall` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/immunizations/adverse-events` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/immunizations/adverse-events` | Authenticated |
| `GET` | `/api/v1/immunizations/adverse-events/:id` | Authenticated |
| `PATCH` | `/api/v1/immunizations/adverse-events/:id` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/immunizations/recalls` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/immunizations/recalls` | Authenticated |
| `GET` | `/api/v1/immunizations/recalls/:id/affected-patients` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PATCH` | `/api/v1/immunizations/recalls/:id/notified` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PATCH` | `/api/v1/immunizations/recalls/:id/resolve` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/verify/immunization/:token` | Public |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Patients](/clinical/patients)
