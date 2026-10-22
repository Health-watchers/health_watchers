---
title: Invoices
description: "Patient invoices with sequential numbering, PDF rendering and preview, email delivery, and manual mark-as-paid."
---

# Invoices

Patient invoices with sequential numbering, PDF rendering and preview, email delivery, and manual mark-as-paid. Patients pay invoices from the portal.

| | |
|---|---|
| **Base path** | `/api/v1/invoices` |
| **Source** | [`apps/api/src/modules/invoices/invoices.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/invoices/invoices.controller.ts) |

## Data model

- Invoice (`invoice.model.ts`)
- InvoiceCounter (`invoice-counter.model.ts`): per-clinic invoice numbering

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/invoices` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/invoices` | Authenticated |
| `GET` | `/api/v1/invoices/:id` | Authenticated |
| `GET` | `/api/v1/invoices/:id/pdf` | Authenticated |
| `GET` | `/api/v1/invoices/:id/preview` | Authenticated |
| `POST` | `/api/v1/invoices/:id/send` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/invoices/:id/mark-paid` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Patient Portal](/clinical/portal)
- [Stellar Payments](/payments/stellar-payments)
