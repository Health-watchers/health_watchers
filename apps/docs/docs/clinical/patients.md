---
title: Patients
description: "The patient registry: demographics, allergies, emergency contacts, insurance policies, photos, medical history, duplicate detection and merge, and AI-assisted risk and health scores."
---

# Patients

The patient registry: demographics, allergies, emergency contacts, insurance policies, photos, medical history, duplicate detection and merge, and AI-assisted risk and health scores. Every patient belongs to exactly one clinic, and all reads and writes are scoped to the caller's clinic.

| | |
|---|---|
| **Base path** | `/api/v1/patients` |
| **Source** | [`apps/api/src/modules/patients/patients.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/patients/patients.controller.ts)<br/>[`apps/api/src/modules/patients/medical-history.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/patients/medical-history.controller.ts)<br/>[`apps/api/src/modules/patients/photo.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/patients/photo.controller.ts)<br/>[`apps/api/src/routes/v2/patients.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/routes/v2/patients.routes.ts) |

## Data model

`Patient` (`models/patient.model.ts`) is the PHI root document.

| Field | Type | Notes |
|-------|------|-------|
| `systemId` | string | Unique, human-readable patient number generated from `PatientCounter` |
| `firstName`, `lastName`, `searchName` | string | `searchName` is a normalised, indexed search key |
| `dateOfBirth` | string | ISO date; encrypted at rest |
| `sex` | `M` \| `F` \| `O` | |
| `contactNumber`, `address` | string | Encrypted at rest (`PHI_FIELDS`) |
| `clinicId` | ObjectId → `Clinic` | Tenant boundary; indexed |
| `isActive` | boolean | Soft-delete flag |
| `allergies[]` | sub-document | `allergen`, `allergenType`, `reaction`, `severity`, `onsetDate`, `recordedBy` |
| `emergencyContacts[]` | sub-document | `name`, `relationship`, `phone`, `email`, `isPrimary` |
| `insurance[]` | sub-document | `provider`, `policyNumber`, `groupNumber`, `coverageType`, `effectiveDate`, `expirationDate`, `isPrimary`; `policyNumber` and `groupNumber` are encrypted at rest |
| `riskScore`, `riskLevel`, `riskFactors` | number / enum / string[] | `riskLevel`: `low`, `medium`, `high`, `critical` |
| `photoUrl`, `thumbnailUrl` | string | Set by the photo endpoints |

Supporting models in `models/`: `MedicalHistory`, `HealthScore`, `RiskScoreHistory`, `MergeLog` (reversible merges), `ImportLog` (CSV imports), and `PatientCounter`.

A v2 list endpoint (`GET /api/v2/patients`) returns the standard v2 response envelope; see [API Reference](/platform/api-reference).

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/patients` | Authenticated |
| `GET` | `/api/v1/patients/search` | Authenticated |
| `GET` | `/api/v1/patients/potential-duplicates` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/patients/:id` | Authenticated |
| `POST` | `/api/v1/patients` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PUT` | `/api/v1/patients/:id` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PATCH` | `/api/v1/patients/:id` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `DELETE` | `/api/v1/patients/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/patients/:id/messages` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN`, `NURSE` |
| `GET` | `/api/v1/patients/:id/payments` | Authenticated |
| `GET` | `/api/v1/patients/:id/encounters` | Authenticated |
| `GET` | `/api/v1/patients/:id/prescriptions` | Authenticated |
| `GET` | `/api/v1/patients/:id/vitals` | Authenticated |
| `GET` | `/api/v1/patients/:id/analytics` | Authenticated |
| `GET` | `/api/v1/patients/:id/lab-results` | Authenticated |
| `GET` | `/api/v1/patients/:id/allergies` | Authenticated |
| `POST` | `/api/v1/patients/:id/allergies` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PUT` | `/api/v1/patients/:id/allergies/:allergyId` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `DELETE` | `/api/v1/patients/:id/allergies/:allergyId` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/patients/:id/insurance` | Authenticated |
| `POST` | `/api/v1/patients/:id/insurance` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PUT` | `/api/v1/patients/:id/insurance/:insuranceId` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PATCH` | `/api/v1/patients/:id/insurance/:insuranceId` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `DELETE` | `/api/v1/patients/:id/insurance/:insuranceId` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/patients/import` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/patients/:id/emergency-contacts` | Authenticated |
| `POST` | `/api/v1/patients/:id/emergency-contacts` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PUT` | `/api/v1/patients/:id/emergency-contacts/:contactId` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `DELETE` | `/api/v1/patients/:id/emergency-contacts/:contactId` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/patients/:id/emergency-alert` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/patients/check-duplicates` | Authenticated |
| `POST` | `/api/v1/patients/:id/merge/:duplicateId` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/patients/unmerge/:mergeLogId` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/patients/:id/risk-history` | Authenticated |
| `POST` | `/api/v1/patients/:id/calculate-health-score` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/patients/:id/health-score` | Authenticated |
| `GET` | `/api/v1/patients/:id/health-score/history` | Authenticated |
| `POST` | `/api/v1/patients/:id/interpret-health-score` | Authenticated |
| `GET` | `/api/v1/patients/:id/risk-explanation` | Authenticated |
| `POST` | `/api/v1/patients/:patientId/medical-history` | Authenticated |
| `GET` | `/api/v1/patients/:patientId/medical-history` | Authenticated |
| `PUT` | `/api/v1/patients/:patientId/medical-history` | Authenticated |
| `DELETE` | `/api/v1/patients/:patientId/medical-history` | Authenticated |
| `POST` | `/api/v1/patients/:id/photo` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/patients/:id/photo` | Authenticated |
| `DELETE` | `/api/v1/patients/:id/photo` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v2/patients` | Authenticated |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Encounters](/clinical/encounters)
- [Immunizations](/clinical/immunizations)
- [Consent](/clinical/consent)
- [Patient Data Requests (user guide)](/user-guide/patient-data-requests)
