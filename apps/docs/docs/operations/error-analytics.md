---
title: Error Analytics
description: "Aggregated API error analytics: summaries, breakdown by error code, trends, top errors, critical errors, and distribution."
---

# Error Analytics

Aggregated API error analytics: summaries, breakdown by error code, trends, top errors, critical errors, and distribution.

| | |
|---|---|
| **Base path** | `/api/v2/errors/analytics` |
| **Source** | [`apps/api/src/modules/monitoring/error-analytics.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/monitoring/error-analytics.controller.ts) |

## Data model

- No dedicated model

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v2/errors/analytics/summary` | `admin` |
| `GET` | `/api/v2/errors/analytics/by-code` | `admin` |
| `GET` | `/api/v2/errors/analytics/trends` | `admin` |
| `GET` | `/api/v2/errors/analytics/top` | `admin` |
| `GET` | `/api/v2/errors/analytics/critical` | `admin` |
| `GET` | `/api/v2/errors/analytics/distribution` | `admin` |

## Roles

Roles referenced by this module: `admin`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
