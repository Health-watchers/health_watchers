---
title: Pre-Authorization
description: "Insurance pre-authorization requests for procedures, with approval, denial and claim submission."
---

# Pre-Authorization

Insurance pre-authorization requests for procedures, with approval, denial and claim submission.

| | |
|---|---|
| **Base path** | `/api/v1/pre-auth` |
| **Source** | [`apps/api/src/modules/pre-auth/pre-auth.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/pre-auth/pre-auth.controller.ts) |

## Data model

- PreAuth (`pre-auth.model.ts`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/pre-auth` | Authenticated |
| `GET` | `/api/v1/pre-auth/:id` | Authenticated |
| `GET` | `/api/v1/pre-auth` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PUT` | `/api/v1/pre-auth/:id/approve` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/pre-auth/:id/claim` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/pre-auth/:id/deny` | `CLINIC_ADMIN`, `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Billing & Claims](/payments/billing)
