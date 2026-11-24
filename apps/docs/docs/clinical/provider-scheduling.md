---
title: Provider Scheduling
description: "Provider availability, bookable slot generation, conflict detection, schedule templates, shift rotations, time-off requests, on-call rosters, schedule optimisation, and utilisation and wait-time analytics."
---

# Provider Scheduling

Provider availability, bookable slot generation, conflict detection, schedule templates, shift rotations, time-off requests, on-call rosters, schedule optimisation, and utilisation and wait-time analytics.

| | |
|---|---|
| **Base path** | `/api/v1/provider-scheduling` |
| **Source** | [`apps/api/src/modules/provider-scheduling/provider-scheduling.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/provider-scheduling/provider-scheduling.controller.ts) |

## Data model

- ProviderAvailability, ScheduleTemplate, ShiftRotation, TimeOff, OnCallSchedule (`models/`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/provider-scheduling/availability` | `CLINIC_ADMIN`, `SUPER_ADMIN`, `DOCTOR`, `NURSE` |
| `GET` | `/api/v1/provider-scheduling/availability/:id` | Authenticated |
| `GET` | `/api/v1/provider-scheduling/slots` | Authenticated |
| `GET` | `/api/v1/provider-scheduling/conflicts` | Authenticated |
| `POST` | `/api/v1/provider-scheduling/templates` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/provider-scheduling/templates` | Authenticated |
| `POST` | `/api/v1/provider-scheduling/templates/:id/apply` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/provider-scheduling/rotations` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/provider-scheduling/rotations/:id/on-date` | Authenticated |
| `POST` | `/api/v1/provider-scheduling/time-off` | `CLINIC_ADMIN`, `SUPER_ADMIN`, `DOCTOR`, `NURSE` |
| `GET` | `/api/v1/provider-scheduling/time-off` | Authenticated |
| `PATCH` | `/api/v1/provider-scheduling/time-off/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/provider-scheduling/on-call` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/provider-scheduling/on-call` | Authenticated |
| `POST` | `/api/v1/provider-scheduling/optimize` | `CLINIC_ADMIN`, `SUPER_ADMIN`, `DOCTOR`, `NURSE` |
| `GET` | `/api/v1/provider-scheduling/analytics/utilization` | `CLINIC_ADMIN`, `SUPER_ADMIN`, `DOCTOR`, `NURSE` |
| `GET` | `/api/v1/provider-scheduling/analytics/wait-times` | `CLINIC_ADMIN`, `SUPER_ADMIN`, `DOCTOR`, `NURSE` |
| `GET` | `/api/v1/provider-scheduling/analytics/load` | Authenticated |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Appointments](/clinical/appointments)
- [Staff Schedules](/clinical/schedules)
