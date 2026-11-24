---
title: Dashboard
description: "Aggregated clinic statistics for the web dashboard home page."
---

# Dashboard

Aggregated clinic statistics for the web dashboard home page.

| | |
|---|---|
| **Base path** | `/api/v1/dashboard` |
| **Source** | [`apps/api/src/modules/dashboard/dashboard.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/dashboard/dashboard.routes.ts) |

## Data model

- No dedicated model; aggregates patients, encounters, appointments and payments

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/dashboard/stats` | Authenticated |
| `GET` | `/api/v1/dashboard` | Authenticated |

## Roles

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
