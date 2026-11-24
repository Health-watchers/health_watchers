---
title: Reports & Analytics
description: "Clinic performance reports (overview, patients, encounters, payments, outcomes, benchmarks), CSV export, an ad-hoc query builder with templates and cohorts, scheduled report delivery by email, and configurable dashboards."
---

# Reports & Analytics

Clinic performance reports (overview, patients, encounters, payments, outcomes, benchmarks), CSV export, an ad-hoc query builder with templates and cohorts, scheduled report delivery by email, and configurable dashboards.

| | |
|---|---|
| **Base path** | `/api/v1/reports` |
| **Source** | [`apps/api/src/modules/reports/reports.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/reports/reports.controller.ts)<br/>[`apps/api/src/modules/reports/analytics/analytics.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/reports/analytics/analytics.controller.ts) |

## Data model

- ReportSchedule, ReportRun (`report-schedule.model.ts`)
- Dashboard, DashboardWidget (`models/dashboard-widget.model.ts`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/reports/overview` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/reports/patients` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/reports/encounters` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/reports/payments` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/reports/export` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/reports/benchmarks` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/reports/benchmark-insights` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/reports/outcomes` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/reports/datasources` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/reports/templates` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/reports/query` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/reports/templates/:id/run` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/reports/cohort` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/reports/schedules` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/reports/schedules` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PATCH` | `/api/v1/reports/schedules/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `DELETE` | `/api/v1/reports/schedules/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/reports/schedules/:id/runs` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/reports/dashboards` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PUT` | `/api/v1/reports/dashboards/:id?` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `DELETE` | `/api/v1/reports/dashboards/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/reports/dashboards/:id/widgets/:key/data` | `CLINIC_ADMIN`, `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

:::note

Every reports route requires `CLINIC_ADMIN` or `SUPER_ADMIN`, enforced at the router level, and uses the `reportGenerationLimiter` rate limiter.

:::

## Related

- [Running reports (user guide)](/user-guide/running-reports)
