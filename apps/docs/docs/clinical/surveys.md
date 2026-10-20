---
title: Patient Surveys
description: "Post-visit satisfaction surveys."
---

# Patient Surveys

Post-visit satisfaction surveys. Patients answer through a tokenised public link, and admins see results and satisfaction reports.

| | |
|---|---|
| **Base path** | `/api/v1/surveys` |
| **Source** | [`apps/api/src/modules/surveys/surveys.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/surveys/surveys.controller.ts) |

## Data model

- Survey (`survey.model.ts`): token, questions, responses

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/surveys/results` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/surveys/:token/submit` | Public |
| `GET` | `/api/v1/surveys/:token` | Public |
| `GET` | `/api/v1/surveys/reports/satisfaction` | `CLINIC_ADMIN`, `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Running reports (user guide)](/user-guide/running-reports)
