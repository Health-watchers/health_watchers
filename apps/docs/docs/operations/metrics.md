---
title: Metrics
description: "A Prometheus metrics endpoint populated by `metricsMiddleware` (request latency and error-rate metrics)."
---

# Metrics

A Prometheus metrics endpoint populated by `metricsMiddleware` (request latency and error-rate metrics).

| | |
|---|---|
| **Base path** | `/metrics` |
| **Source** | [`apps/api/src/modules/metrics/metrics.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/metrics/metrics.routes.ts) |

## Data model

- No dedicated model

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/metrics` | Public |

## Roles

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Deployment & Monitoring](/operations/deployment)
