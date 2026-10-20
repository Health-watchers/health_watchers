---
title: Breach Incidents
description: "Platform-level HIPAA breach incident management for Super Admins."
---

# Breach Incidents

Platform-level HIPAA breach incident management for Super Admins. It covers incident intake, status workflow, overdue notification tracking, and generation of HHS breach reports.

| | |
|---|---|
| **Base path** | `/api/v1/admin/breach-incidents` |
| **Source** | [`apps/api/src/modules/breach-incidents/breach-incidents.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/breach-incidents/breach-incidents.controller.ts) |

## Data model

- BreachIncident (`breach-incident.model.ts`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/admin/breach-incidents` | `SUPER_ADMIN` |
| `GET` | `/api/v1/admin/breach-incidents` | `SUPER_ADMIN` |
| `GET` | `/api/v1/admin/breach-incidents/overdue` | `SUPER_ADMIN` |
| `GET` | `/api/v1/admin/breach-incidents/:id/hhs-report` | `SUPER_ADMIN` |
| `PATCH` | `/api/v1/admin/breach-incidents/:id` | `SUPER_ADMIN` |
| `PATCH` | `/api/v1/admin/breach-incidents/:id/status` | `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

:::note

The whole router requires `SUPER_ADMIN`.

:::
