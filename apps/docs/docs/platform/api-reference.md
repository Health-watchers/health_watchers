---
title: API Reference
description: How the Health Watchers REST API is versioned, documented, and authenticated.
---

# API Reference

## Versions and base paths

| Base path | Status | Notes |
|-----------|--------|-------|
| `/api/v1` | Deprecated (sunset headers sent) | All modules. Responses carry `Deprecation`, `Sunset` and `Link` headers |
| `/api/v2` | Current | Patients and appointments use the v2 response envelope. Admin endpoints for migrations, error analytics, rate limits, cache and jobs |
| `/fhir/r4` | Current | Read-only FHIR R4 facade, authenticated with API keys |
| `/health`, `/metrics` | Current | Probes and Prometheus metrics |

Every versioned response includes an `API-Version` header and an `X-Trace-Id` header. The full versioning policy is in [`CHANGELOG.md`](https://github.com/Health-watchers/health_watchers/blob/main/CHANGELOG.md) and the [API migration guide](https://github.com/Health-watchers/health_watchers/blob/main/docs/API_MIGRATION_GUIDE.md).

## Interactive documentation

- **Swagger UI**: available at `/api/docs` on a running API server.
- **OpenAPI spec**: [`apps/api/docs/openapi.json`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/docs/openapi.json), regenerated with `npm run generate:openapi --workspace=api`.
- **Postman**: the collection and environment are in [`docs/postman/`](https://github.com/Health-watchers/health_watchers/tree/main/docs/postman).

## Authentication

| Caller | Mechanism | See |
|--------|-----------|-----|
| Staff (web/mobile) | JWT access token plus refresh token, optional TOTP MFA | [Authentication](./auth.md) |
| Patients | Portal login with the `PATIENT` role | [Patient Portal](../clinical/portal.md) |
| Integrations | API keys | [API Keys](./api-keys.md), [FHIR R4](./fhir.md) |
| Webhooks from Stellar / insurers | Request signatures | [Webhooks](./webhooks.md) |

## Roles

`SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT`, `READ_ONLY`, and `PATIENT`. Each module page lists the roles required for each endpoint. Data is always scoped to the caller's clinic unless the caller is a `SUPER_ADMIN`.

## Rate limits

General, auth, AI, payment, export, patient-search and report-generation limiters are applied per route group. See [`docs/API_RATE_LIMITING.md`](https://github.com/Health-watchers/health_watchers/blob/main/docs/API_RATE_LIMITING.md) and [Rate Limit Administration](../operations/rate-limiting.md).

## Further reading

- [Error codes](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/docs/error-codes.md)
- [Validation rules](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/docs/validation-rules.md)
- [Client SDKs](https://github.com/Health-watchers/health_watchers/blob/main/docs/SDK_GUIDE.md)
