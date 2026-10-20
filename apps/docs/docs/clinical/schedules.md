---
title: Staff Schedules
description: "Staff shift schedules and per-user availability lookups."
---

# Staff Schedules

Staff shift schedules and per-user availability lookups.

| | |
|---|---|
| **Base path** | `/api/v1/schedules` |
| **Source** | [`apps/api/src/modules/schedules/schedules.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/schedules/schedules.controller.ts) |

## Data model

- Schedule, StaffSchedule (`models/`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/schedules/staff` | Authenticated |
| `GET` | `/api/v1/schedules/staff` | Authenticated |
| `GET` | `/api/v1/schedules/staff/:id` | Authenticated |
| `PUT` | `/api/v1/schedules/staff/:id` | Authenticated |
| `DELETE` | `/api/v1/schedules/staff/:id` | Authenticated |
| `GET` | `/api/v1/schedules/staff/availability/:userId` | Authenticated |

## Roles

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Provider Scheduling](/clinical/provider-scheduling)
