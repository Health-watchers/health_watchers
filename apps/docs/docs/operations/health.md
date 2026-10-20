---
title: Health Checks
description: "Kubernetes probes (`/health/live`, `/health/ready`, `/health/startup`), dependency and system health, background-job and tracing status, backup health, and a comprehensive health report with history."
---

# Health Checks

Kubernetes probes (`/health/live`, `/health/ready`, `/health/startup`), dependency and system health, background-job and tracing status, backup health, and a comprehensive health report with history.

| | |
|---|---|
| **Base path** | `/health, /api/v1/health` |
| **Source** | [`apps/api/src/modules/health/comprehensive-health.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/health/comprehensive-health.controller.ts)<br/>[`apps/api/src/modules/health/health.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/health/health.controller.ts)<br/>[`apps/api/src/modules/health/backup-health.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/health/backup-health.controller.ts) |

## Data model

- No dedicated model

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/health/comprehensive` | Public |
| `GET` | `/api/v1/health/history` | Public |
| `GET` | `/api/v1/health/dependencies` | Public |
| `GET` | `/api/v1/health/system` | Public |
| `GET` | `/api/v1/health/quick` | Public |
| `GET` | `/health/startup` | Public |
| `GET` | `/health/live` | Public |
| `GET` | `/health/ready` | Public |
| `GET` | `/health/jobs` | Public |
| `GET` | `/health/errors` | Public |
| `GET` | `/health` | Public |
| `GET` | `/health/tracing` | Public |
| `GET` | `/health/trace-context` | Public |
| `GET` | `/health/backup` | Public |
| `GET` | `/health/backup/detailed` | Public |

## Roles

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

:::note

Health endpoints are unauthenticated so that load balancers and probes can reach them.

:::
