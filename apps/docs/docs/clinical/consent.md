---
title: Consent
description: "Patient consent capture, verification and withdrawal (for example `data_sharing`), plus consent form templates and versioned re-consent."
---

# Consent

Patient consent capture, verification and withdrawal (for example `data_sharing`), plus consent form templates and versioned re-consent. Staff-initiated data exports check consent.

| | |
|---|---|
| **Base path** | /api/v1 (mounted at the router root: `/patients/:id/consent`, `/consent/:id/verify`, `/templates`, `/forms`, `/current-version`, `/re-consent`) |
| **Source** | [`apps/api/src/modules/consent/consent.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/consent/consent.controller.ts) |

## Data model

- Consent (`consent.model.ts`): `patientId`, `clinicId`, consent type, `version`/`formVersion`, `signatureData`/`signatureHash`, `grantedBy`, `grantedAt`, `expiresAt`, `withdrawnAt`, `ipAddress`, `userAgent`
- ConsentForm (`consent-form.model.ts`): clinic-defined consent templates

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/templates` | Authenticated |
| `POST` | `/api/v1/patients/:id/consent` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN`, `NURSE`, `PATIENT` |
| `POST` | `/api/v1/consent/:id/verify` | Authenticated |
| `GET` | `/api/v1/patients/:id/consent` | Authenticated |
| `DELETE` | `/api/v1/patients/:id/consent/:type` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN`, `NURSE`, `PATIENT` |
| `POST` | `/api/v1/forms` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/current-version` | Authenticated |
| `POST` | `/api/v1/re-consent` | Authenticated |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `PATIENT`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Data Export](/platform/export)
- [Patient Data Requests (user guide)](/user-guide/patient-data-requests)
