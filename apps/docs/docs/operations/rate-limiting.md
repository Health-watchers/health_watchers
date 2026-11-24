---
title: Rate Limit Administration
description: "Inspects rate-limit tiers, metrics and violations, tests a key against the limits, and resets counters."
---

# Rate Limit Administration

Inspects rate-limit tiers, metrics and violations, tests a key against the limits, and resets counters.

| | |
|---|---|
| **Base path** | `/api/v2/rate-limits` |
| **Source** | [`apps/api/src/modules/rate-limiting/rate-limit-config.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/rate-limiting/rate-limit-config.controller.ts) |

## Data model

- Counters are stored in Redis

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v2/rate-limits/tiers` | `admin` |
| `GET` | `/api/v2/rate-limits/metrics` | `admin` |
| `GET` | `/api/v2/rate-limits/violations` | `admin` |
| `POST` | `/api/v2/rate-limits/check` | `admin` |
| `POST` | `/api/v2/rate-limits/reset` | `admin` |

## Roles

Roles referenced by this module: `admin`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
