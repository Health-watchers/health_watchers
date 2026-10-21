---
title: Billing & Claims
description: "Revenue-cycle management for insurance billing."
---

# Billing & Claims

Revenue-cycle management for insurance billing. It covers unbilled and denied encounters, CMS-1500 / EDI 837 claim generation and submission, denial, resubmission and write-off, claim attachments, aging reports, CPT/SNOMED code search and assignment, insurance eligibility verification, and credit notes.

| | |
|---|---|
| **Base path** | `/api/v1/billing` |
| **Source** | [`apps/api/src/modules/billing/insurance-verification.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/billing/insurance-verification.controller.ts)<br/>[`apps/api/src/modules/billing/billing-code.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/billing/billing-code.controller.ts)<br/>[`apps/api/src/modules/billing/credit-note.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/billing/credit-note.controller.ts)<br/>[`apps/api/src/modules/billing/billing.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/billing/billing.routes.ts) |

## Data model

| Model | File | Purpose |
|-------|------|---------|
| `Claim` | `claim.model.ts` | `encounterId`, `patientId`, `clinicId`, `cptCodes[]`, `diagnosisCodes[]`, `totalAmount`, `status` (`draft`, `submitted`, `accepted`, `rejected`, `paid`, `resubmitted`, `written_off`), `cms1500Data`, `edi837Data`, `submittedAt`, `rejectionReason`, `resubmissionCount`, `writeOffReason`, `statusHistory[]`, `attachments[]` |
| `CreditNote` | `credit-note.model.ts` | Credits issued against invoices, which can be applied or voided |
| `InsuranceVerification` | `insurance-verification.model.ts` | Eligibility checks against a patient's insurance policy |

Encounters carry their own `billingStatus` (`unbilled`, `billed`, `paid`, `denied`). Generating a claim moves the encounter from `unbilled` to `billed`.

## Roles

`billing.routes.ts` defines two role sets:

- `BILLING_READ_ROLES`: `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`
- `BILLING_WRITE_ROLES`: `SUPER_ADMIN`, `CLINIC_ADMIN`

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/billing/insurance-verification` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/billing/insurance-verification` | Authenticated |
| `GET` | `/api/v1/billing/insurance-verification/latest` | Authenticated |
| `GET` | `/api/v1/billing/insurance-verification/:id` | Authenticated |
| `POST` | `/api/v1/billing/codes/assign` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/billing/codes/cpt/search` | Authenticated |
| `GET` | `/api/v1/billing/codes/snomed/search` | Authenticated |
| `GET` | `/api/v1/billing/codes/catalog` | Authenticated |
| `POST` | `/api/v1/billing/credit-notes` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/billing/credit-notes` | Authenticated |
| `POST` | `/api/v1/billing/credit-notes/:id/apply` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/billing/credit-notes/:id/void` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/billing/unbilled` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR` |
| `GET` | `/api/v1/billing/denied` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR` |
| `POST` | `/api/v1/billing/encounters/:id/generate-claim` | `SUPER_ADMIN`, `CLINIC_ADMIN` |
| `GET` | `/api/v1/billing/claims` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR` |
| `GET` | `/api/v1/billing/claims/counts` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR` |
| `POST` | `/api/v1/billing/claims/submit` | `SUPER_ADMIN`, `CLINIC_ADMIN` |
| `GET` | `/api/v1/billing/claims/:claimId` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR` |
| `PATCH` | `/api/v1/billing/claims/:claimId/deny` | `SUPER_ADMIN`, `CLINIC_ADMIN` |
| `PATCH` | `/api/v1/billing/claims/:claimId/resubmit` | `SUPER_ADMIN`, `CLINIC_ADMIN` |
| `PATCH` | `/api/v1/billing/claims/:claimId/write-off` | `SUPER_ADMIN`, `CLINIC_ADMIN` |
| `POST` | `/api/v1/billing/claims/:claimId/attachments` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR` |
| `GET` | `/api/v1/billing/queries/unbilled-encounters` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR` |
| `GET` | `/api/v1/billing/queries/denied-encounters` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR` |
| `GET` | `/api/v1/billing/queries/aging-report` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR` |
| `GET` | `/api/v1/billing/queries/summary` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Encounters](/clinical/encounters)
- [Invoices](/payments/invoices)
- [Pre-Authorization](/payments/pre-auth)
