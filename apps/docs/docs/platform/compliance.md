---
title: Compliance (BAAs & Breaches)
description: "Business Associate Agreement tracking (with signed document storage) and the clinic breach register."
---

# Compliance (BAAs & Breaches)

Business Associate Agreement tracking (with signed document storage) and the clinic breach register.

| | |
|---|---|
| **Base path** | `/api/v1/compliance` |
| **Source** | [`apps/api/src/modules/compliance/compliance.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/compliance/compliance.controller.ts) |

## Data model

- BAA (`baa.model.ts`)
- Breach (`breach.model.ts`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/compliance/baas` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/compliance/baas` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/compliance/baas/:id/document` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/compliance/baas/:id/document` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/compliance/breaches` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/compliance/breaches` | `CLINIC_ADMIN`, `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Breach Incidents](/platform/breach-incidents)
- [Security & HIPAA](/security/hipaa-compliance)
