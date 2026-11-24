---
title: ICD-10 Codes
description: "ICD-10 code search and lookup, plus each clinic's favourite and recently used codes, which are shown first when clinicians search."
---

# ICD-10 Codes

ICD-10 code search and lookup, plus each clinic's favourite and recently used codes, which are shown first when clinicians search.

| | |
|---|---|
| **Base path** | `/api/v1/icd10` |
| **Source** | [`apps/api/src/modules/icd10/icd10.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/icd10/icd10.controller.ts) |

## Data model

- ICD10Code (`icd10.model.ts`): code catalogue
- ClinicICD10Favorites (`clinic-icd10-favorites.model.ts`): per-clinic favourite codes
- ClinicICD10Recent (`clinic-icd10-recent.model.ts`): per-clinic recently used codes

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/icd10/search` | Authenticated |
| `GET` | `/api/v1/icd10/favorites` | Authenticated |
| `POST` | `/api/v1/icd10/favorites` | Authenticated |
| `DELETE` | `/api/v1/icd10/favorites/:code` | Authenticated |
| `GET` | `/api/v1/icd10/recent` | Authenticated |
| `POST` | `/api/v1/icd10/recent` | Authenticated |
| `GET` | `/api/v1/icd10/:code` | Authenticated |

## Roles

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Configuring ICD-10 favourites (user guide)](/user-guide/cds-rules-and-icd10-favourites)
