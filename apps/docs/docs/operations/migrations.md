---
title: Migration Status
description: "Reports the state of the `migrate-mongo` database migrations (applied, pending, latest)."
---

# Migration Status

Reports the state of the `migrate-mongo` database migrations (applied, pending, latest).

| | |
|---|---|
| **Base path** | `/api/v2/migrations` |
| **Source** | [`apps/api/src/modules/migrations/migration-status.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/migrations/migration-status.controller.ts) |

## Data model

- Reads the migrate-mongo `changelog` collection

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v2/migrations/status` | `admin` |
| `GET` | `/api/v2/migrations/latest` | `admin` |

## Roles

Roles referenced by this module: `admin`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
