---
title: FHIR R4
description: "A read-only HL7 FHIR R4 facade over patients, encounters and observations (vitals and lab results), for interoperability with external systems."
---

# FHIR R4

A read-only HL7 FHIR R4 facade over patients, encounters and observations (vitals and lab results), for interoperability with external systems.

| | |
|---|---|
| **Base path** | `/fhir/r4` |
| **Source** | [`apps/api/src/modules/fhir/fhir.router.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/fhir/fhir.router.ts) |

## Data model

- No dedicated model; maps `Patient`, `Encounter` and `LabResult` to FHIR resources

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/fhir/r4/metadata` | Public |
| `GET` | `/fhir/r4/Patient/:id` | Public |
| `GET` | `/fhir/r4/Patient` | Public |
| `GET` | `/fhir/r4/Encounter` | Public |
| `GET` | `/fhir/r4/Observation` | Public |

## Roles

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

:::note

FHIR routes authenticate with an API key (`authenticateApiKey`) and are rate limited per key. They do not use a user session.

:::

## Related

- [API Keys](/platform/api-keys)
