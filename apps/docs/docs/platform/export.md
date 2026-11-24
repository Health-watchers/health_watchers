---
title: Data Export
description: "Data portability: a patient record export (HIPAA right of access, JSON or PDF, optionally anonymised), clinic and research exports (Super Admin), FHIR and HL7 v2 (ADT, ORU, RDE) patient exports, batch and streaming exports with progress, and scheduled exports."
---

# Data Export

Data portability: a patient record export (HIPAA right of access, JSON or PDF, optionally anonymised), clinic and research exports (Super Admin), FHIR and HL7 v2 (ADT, ORU, RDE) patient exports, batch and streaming exports with progress, and scheduled exports.

| | |
|---|---|
| **Base path** | /api/v1 (`/patients/:id/export`, `/patients/:id/hl7v2`, …), /api/v1/exports |
| **Source** | [`apps/api/src/modules/export/export.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/export/export.routes.ts)<br/>[`apps/api/src/modules/export/hl7-v2-export.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/export/hl7-v2-export.routes.ts)<br/>[`apps/api/src/modules/export/batch-export.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/export/batch-export.routes.ts)<br/>[`apps/api/src/modules/export/export-schedule.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/export/export-schedule.routes.ts) |

## Data model

- ExportLog (`export-log.model.ts`)
- ExportRequest (`export-request.model.ts`)
- ExportSchedule (`export-schedule.model.ts`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/patients/:id/export` | Authenticated |
| `GET` | `/api/v1/clinics/:id/export` | `SUPER_ADMIN` |
| `GET` | `/api/v1/research/export` | `SUPER_ADMIN` |
| `GET` | `/api/v1/patients/:id/fhir` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/patients/:id/hl7v2` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN`, `NURSE` |
| `GET` | `/api/v1/patients/:id/hl7v2/adt` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN`, `NURSE` |
| `GET` | `/api/v1/patients/:id/hl7v2/oru` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN`, `NURSE` |
| `GET` | `/api/v1/patients/:id/hl7v2/rde` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN`, `NURSE` |
| `POST` | `/api/v1/exports/batch` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/exports/stream/:type/:format` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/exports/progress/:jobId` | Authenticated |
| `GET` | `/api/v1/exports/progress/:jobId/stream` | Authenticated |
| `POST` | `/api/v1/exports/schedules` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/exports/schedules` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PATCH` | `/api/v1/exports/schedules/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `DELETE` | `/api/v1/exports/schedules/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/exports/schedules/:id/enable` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/exports/schedules/:id/disable` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/exports/schedules/:id/run` | `CLINIC_ADMIN`, `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

:::note

Staff-initiated patient exports (other than by `SUPER_ADMIN`) require the patient's `data_sharing` [consent](/clinical/consent). Every export is written to the audit log and uses `bulkExportLimiter`.

:::

## Related

- [Handling patient data requests (user guide)](/user-guide/patient-data-requests)
