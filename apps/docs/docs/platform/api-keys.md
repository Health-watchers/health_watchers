---
title: API Keys
description: "Machine credentials for integrations such as FHIR clients."
---

# API Keys

Machine credentials for integrations such as FHIR clients. Admins can create, scope, rotate and revoke keys, and see usage analytics.

| | |
|---|---|
| **Base path** | `/api/v1/api-keys` |
| **Source** | [`apps/api/src/modules/api-keys/api-keys.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/api-keys/api-keys.routes.ts) |

## Data model

- ApiKey (`models/api-key.model.ts`): hashed key, scopes, expiry
- ApiKeyUsage (`models/api-key-usage.model.ts`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/api-keys` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/api-keys` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PATCH` | `/api/v1/api-keys/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/api-keys/:id/rotate` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `DELETE` | `/api/v1/api-keys/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/api-keys/:id/usage` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/api-keys/:id/analytics` | `CLINIC_ADMIN`, `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [FHIR R4](/platform/fhir)
