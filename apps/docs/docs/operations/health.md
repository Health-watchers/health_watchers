---
title: Health Checks
description: "Kubernetes probes (`/health/live`, `/health/ready`, `/health/startup`), dependency and system health, background-job and tracing status, backup health, and a comprehensive health report with history."
---

# Health Checks

Kubernetes probes (`/health/live`, `/health/ready`, `/health/startup`, `/ready`), dependency and system health, background-job and tracing status, backup health, and a comprehensive health report with history.

| | |
|---|---|
| **Base path** | `/health, /ready, /api/v1/health` |
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
| `GET` | `/ready` | Public |
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

## Kubernetes probes

Each probe answers a different question, so each one should point at a different endpoint. Using the wrong endpoint causes either unnecessary restarts or traffic being sent to a pod that cannot serve it.

| Probe | Endpoint | Question it answers | On failure |
|-------|----------|---------------------|------------|
| **Liveness** | `/health/live` | Is the process alive and not deadlocked? | kubelet restarts the container |
| **Readiness** | `/ready` | Can this pod serve traffic right now (database reachable)? | Pod is removed from Service endpoints, no restart |
| **Startup** | `/health/startup` | Has slow initialization finished? | kubelet restarts the container |

### Liveness — `/health/live`

`/health/live` only reports that the Node process is running and its event loop is responsive. It deliberately does **not** check the database or any other dependency: a transient database outage must not cause every pod to be restarted in a loop. Use `/health` or `/health/live` for liveness; never use a dependency-checking endpoint here.

### Readiness — `/ready`

`/ready` performs a database connectivity check (a lightweight query against the primary connection). It returns:

- **`200 OK`** with `{ "status": "ready", "database": "up" }` when the database is reachable.
- **`503 Service Unavailable`** with `{ "status": "not_ready", "database": "down" }` when the check fails.

Because a failing readiness probe only removes the pod from load balancing, it is safe (and desirable) for this endpoint to fail fast during a database outage. The pod stays alive and rejoins the endpoints as soon as connectivity is restored.

### Startup — `/health/startup`

Services with slow initialization (for example `stellar-service`, which warms up caches and opens outbound connections) should use a startup probe so that liveness checks do not kill the container before it has finished booting. Once the startup probe succeeds, liveness and readiness take over.

### Example configuration

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 3
startupProbe:            # only for services with slow initialization
  httpGet:
    path: /health/startup
    port: 3000
  periodSeconds: 5
  failureThreshold: 30   # allow up to ~150s to boot
```

### Rolling deployments

During a rolling update, new pods stay out of the Service until `/ready` returns `200`, so traffic is never routed to a pod whose database connection is not yet established. Old pods keep serving until their replacements are ready. If a deployment stalls with pods never becoming ready, check `/ready` on the new pods first — a `503` there points at database connectivity or configuration rather than at the application process itself.
