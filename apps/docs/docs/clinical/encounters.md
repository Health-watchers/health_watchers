---
title: Encounters
description: "Clinical visits: chief complaint, SOAP notes, vital signs, ICD-10 diagnoses, prescriptions, CPT codes and billing status, attachments, reusable encounter templates, and co-signature workflows."
---

# Encounters

Clinical visits: chief complaint, SOAP notes, vital signs, ICD-10 diagnoses, prescriptions, CPT codes and billing status, attachments, reusable encounter templates, and co-signature workflows.

| | |
|---|---|
| **Base path** | `/api/v1/encounters` |
| **Source** | [`apps/api/src/modules/encounters/attachments.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/encounters/attachments.controller.ts)<br/>[`apps/api/src/modules/encounters/encounters.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/encounters/encounters.controller.ts)<br/>[`apps/api/src/modules/encounters/encounter-lazy-load.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/encounters/encounter-lazy-load.routes.ts)<br/>[`apps/api/src/modules/encounters/encounter-templates.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/encounters/encounter-templates.controller.ts) |

## Data model

`Encounter` (`encounter.model.ts`):

| Field | Type | Notes |
|-------|------|-------|
| `patientId` | ObjectId → `Patient` | Indexed |
| `clinicId` | ObjectId → `Clinic` | Tenant boundary |
| `attendingDoctorId` | ObjectId → `User` | Indexed |
| `type` | enum | `consultation`, `telemedicine`, `follow-up`, `procedure` |
| `status` | enum | `open`, `closed`, `follow-up`, `cancelled`, `pending_cosignature` |
| `chiefComplaint` | string | Required |
| `soapNotes` | sub-document | `subjective`, `objective`, `assessment`, `plan` |
| `vitalSigns` | sub-document | `bloodPressure`, `heartRate`, `temperature`, `respiratoryRate`, `oxygenSaturation`, `weight`, `height` |
| `diagnosis[]` | sub-document | ICD-10 `code`, `description`, `isPrimary` |
| `prescriptions[]` | sub-document | `drugName`, `dosage`, `frequency`, `duration`, `route`, `refillsAllowed`, optional allergy override |
| `cptCodes[]`, `totalFee`, `billingStatus` | sub-document / string / enum | `billingStatus`: `unbilled`, `billed`, `paid`, `denied` |
| `attachments[]` | sub-document | PDF, JPEG, PNG or DICOM files in object storage |
| `appointmentId`, `templateVersionId` | ObjectId | Optional links |
| `followUpDate`, `aiSummary`, `patientFriendlySummary` | date / string | |

`EncounterTemplate` (`encounter-template.model.ts`) stores versioned templates. Templates can be published to a marketplace, which a Super Admin moderates.

## Workflow

1. A clinician creates an encounter (`POST /encounters`), often from a checked-in appointment.
2. Creating the encounter evaluates [CDS](/clinical/cds) rules for the `encounter_create` trigger. Prescriptions are cross-checked against the patient's recorded allergies, and clinicians can run [drug-interaction](/clinical/interactions) checks.
3. Notes written by a supervised clinician can be sent for co-signature (`request-cosign` → `cosign` / `reject-cosign`).
4. Closing the encounter with CPT codes makes it available to [billing](/payments/billing) as an unbilled encounter.

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/encounters/:encounterId/attachments` | Authenticated |
| `GET` | `/api/v1/encounters/:encounterId/attachments` | Authenticated |
| `GET` | `/api/v1/encounters/:encounterId/attachments/:attachmentId/download` | Authenticated |
| `DELETE` | `/api/v1/encounters/:encounterId/attachments/:attachmentId` | Authenticated |
| `GET` | `/api/v1/encounters` | Authenticated |
| `POST` | `/api/v1/encounters` | `DOCTOR`, `CLINIC_ADMIN`, `NURSE` |
| `GET` | `/api/v1/encounters/follow-ups-due` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN` |
| `GET` | `/api/v1/encounters/:id` | Authenticated |
| `PUT` | `/api/v1/encounters/:id/outcome` | `DOCTOR`, `CLINIC_ADMIN` |
| `PATCH` | `/api/v1/encounters/:id` | `DOCTOR`, `CLINIC_ADMIN` |
| `DELETE` | `/api/v1/encounters/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/encounters/patient/:patientId` | Authenticated |
| `POST` | `/api/v1/encounters/:id/prescriptions` | `DOCTOR`, `CLINIC_ADMIN` |
| `GET` | `/api/v1/encounters/:id/prescriptions` | Authenticated |
| `DELETE` | `/api/v1/encounters/:id/prescriptions/:prescriptionId` | `DOCTOR`, `CLINIC_ADMIN` |
| `GET` | `/api/v1/encounters/pending-cosignatures` | Authenticated |
| `POST` | `/api/v1/encounters/:id/request-cosign` | Authenticated |
| `POST` | `/api/v1/encounters/:id/cosign` | Authenticated |
| `POST` | `/api/v1/encounters/:id/reject-cosign` | Authenticated |
| `GET` | `/api/v1/encounters/:encounterId/relation/:relation` | Authenticated |
| `GET` | `/api/v1/encounters/:encounterId/relations` | Authenticated |
| `GET` | `/api/v1/encounter-templates` | Authenticated |
| `GET` | `/api/v1/encounter-templates/:id` | Authenticated |
| `POST` | `/api/v1/encounter-templates` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PUT` | `/api/v1/encounter-templates/:id` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `DELETE` | `/api/v1/encounter-templates/:id` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/encounter-templates/:id/clone` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/encounter-templates/:id/history` | Authenticated |
| `GET` | `/api/v1/encounter-templates/:id/preview` | Authenticated |
| `POST` | `/api/v1/encounter-templates/:id/publish` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/encounter-templates/:id/import` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/encounter-templates/:id/rate` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/encounter-templates/marketplace/browse` | Authenticated |
| `GET` | `/api/v1/encounter-templates/marketplace/search` | Authenticated |
| `POST` | `/api/v1/encounter-templates/:id/approve` | `SUPER_ADMIN` |
| `POST` | `/api/v1/encounter-templates/:id/reject` | `SUPER_ADMIN` |
| `POST` | `/api/v1/encounter-templates/:id/remove` | `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Patients](/clinical/patients)
- [Billing & Claims](/payments/billing)
- [Clinical Decision Support](/clinical/cds)
- [ICD-10 Codes](/clinical/icd10)
