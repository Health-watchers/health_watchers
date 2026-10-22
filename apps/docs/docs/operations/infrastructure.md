---
title: Infrastructure Endpoints
description: "Admin-only endpoints for database sharding health and routing, CDN cache invalidation and health, MongoDB replication status and failover testing, and background-job administration."
---

# Infrastructure Endpoints

Admin-only endpoints for database sharding health and routing, CDN cache invalidation and health, MongoDB replication status and failover testing, and background-job administration.

| | |
|---|---|
| **Base path** | `/api/v1/sharding, /api/v1/cdn, /api/v1/replication, /api/v2/admin/jobs` |
| **Source** | [`apps/api/src/routes/sharding.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/routes/sharding.ts)<br/>[`apps/api/src/routes/cdn/cache-invalidation.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/routes/cdn/cache-invalidation.ts)<br/>[`apps/api/src/routes/cdn/cdn-health.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/routes/cdn/cdn-health.ts)<br/>[`apps/api/src/routes/replication.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/routes/replication.ts)<br/>[`apps/api/src/jobs/jobs-admin.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/jobs/jobs-admin.controller.ts) |

## Data model

- No dedicated models

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/sharding/health` | `admin` |
| `POST` | `/api/v1/sharding/health-check` | `admin` |
| `GET` | `/api/v1/sharding/strategy` | `admin` |
| `GET` | `/api/v1/sharding/balance/:collection` | `admin` |
| `GET` | `/api/v1/sharding/route` | `admin` |
| `POST` | `/api/v1/cdn/cache-invalidation` | `admin` |
| `POST` | `/api/v1/cdn/cache-invalidation/bulk` | `admin` |
| `GET` | `/api/v1/cdn/cache-status/:path` | Authenticated |
| `GET` | `/api/v1/cdn/metrics` | `admin` |
| `GET` | `/api/v1/cdn/health` | `admin` |
| `GET` | `/api/v1/cdn/config` | `admin` |
| `POST` | `/api/v1/cdn/test-delivery` | `admin` |
| `GET` | `/api/v1/replication/status` | `admin` |
| `GET` | `/api/v1/replication/lag` | `admin` |
| `GET` | `/api/v1/replication/consistency` | `admin` |
| `POST` | `/api/v1/replication/test-failover` | `admin` |
| `GET` | `/api/v1/replication/read-preferences` | `admin` |
| `GET` | `/api/v1/replication/metrics` | `admin` |
| `GET` | `/api/v2/admin/jobs` | `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `SUPER_ADMIN`, `admin`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
