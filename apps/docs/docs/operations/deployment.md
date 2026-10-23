---
title: Deployment & Monitoring
description: Where to find the deployment, scaling and monitoring guides for Health Watchers.
---

# Deployment & Monitoring

Health Watchers ships as container images for the API, worker, web app and Stellar service. You can deploy them with Docker Compose, raw Kubernetes manifests, or the Helm chart.

## Deployment targets

| Target | Location | Guide |
|--------|----------|-------|
| Docker Compose (profiles `core`, `dev-tools`, `monitoring`, `elk`, `replica`, `stellar`) | `docker-compose.yml`, `docker-compose.prod.yml` | [README: Quick Start](https://github.com/Health-watchers/health_watchers#quick-start-with-docker-compose-profiles) |
| Kubernetes manifests | [`k8s/`](https://github.com/Health-watchers/health_watchers/tree/main/k8s) | [KUBERNETES_DEPLOYMENT.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/KUBERNETES_DEPLOYMENT.md) |
| Helm chart | [`helm/health-watchers`](https://github.com/Health-watchers/health_watchers/tree/main/helm) | [HELM_DEPLOYMENT.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/HELM_DEPLOYMENT.md) |
| Infrastructure as code | [`terraform/`](https://github.com/Health-watchers/health_watchers/tree/main/terraform) | [terraform/README.md](https://github.com/Health-watchers/health_watchers/blob/main/terraform/README.md) |

## Release strategy

- [Deployment guide and checklist](https://github.com/Health-watchers/health_watchers/blob/main/docs/DEPLOYMENT_GUIDE.md)
- [Blue-green deployment](https://github.com/Health-watchers/health_watchers/blob/main/docs/BLUE_GREEN_DEPLOYMENT.md)
- [CI/CD pipeline](https://github.com/Health-watchers/health_watchers/blob/main/docs/CI_CD_PIPELINE.md)
- [Release process](https://github.com/Health-watchers/health_watchers/blob/main/docs/RELEASE.md)
- [Auto-scaling](https://github.com/Health-watchers/health_watchers/blob/main/docs/AUTO_SCALING_GUIDE.md)

## Monitoring

| Signal | Source | Docs |
|--------|--------|------|
| Metrics | Prometheus scrapes [`/metrics`](./metrics.md). Alert rules are in [`monitoring/`](https://github.com/Health-watchers/health_watchers/tree/main/monitoring) | [OBSERVABILITY.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/OBSERVABILITY.md) |
| Logs | Pino structured logs, ELK profile | [OBSERVABILITY.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/OBSERVABILITY.md) |
| Traces | OpenTelemetry → Jaeger | [OBSERVABILITY.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/OBSERVABILITY.md) |
| Health | [Health checks](./health.md) | |
| Load | k6 scripts in [`k6/`](https://github.com/Health-watchers/health_watchers/tree/main/k6) | [LOAD_TESTING.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/LOAD_TESTING.md) |

## Secrets rotation

JWT secrets, Stellar keypairs and MongoDB credentials are rotated with the Lambda in [`k8s/secret-rotation-lambda.py`](https://github.com/Health-watchers/health_watchers/blob/main/k8s/secret-rotation-lambda.py), configured by [`k8s/secret-rotation-config.yaml`](https://github.com/Health-watchers/health_watchers/blob/main/k8s/secret-rotation-config.yaml). Rotation is zero-downtime: the new secret is written alongside the old one, pods pick it up on restart, and the old value is revoked only after the rollout completes.

- [Secrets rotation runbook](https://github.com/Health-watchers/health_watchers/blob/main/docs/runbooks/secrets-rotation.md) — procedure for each secret type, local Lambda testing with `aws lambda invoke`, and zero-downtime verification.
- Manual rotation workflow: [`.github/workflows/secret-rotation.yml`](https://github.com/Health-watchers/health_watchers/blob/main/.github/workflows/secret-rotation.yml) — triggered via `workflow_dispatch` and gated by a required reviewer approval.
- Prometheus alerts for secrets nearing their rotation date live in [`monitoring/`](https://github.com/Health-watchers/health_watchers/tree/main/monitoring).

## Probes

Liveness and readiness probes are documented in [`k8s/README.md`](https://github.com/Health-watchers/health_watchers/blob/main/k8s/README.md). In short: `/health` is a liveness probe (process is up, no dependencies), `/ready` is a readiness probe (checks database connectivity, removes the pod from Service endpoints while failing), and services with slow initialization such as `stellar-service` use a startup probe so liveness checks do not restart them prematurely. Verify probe behaviour during rolling deployments by watching `kubectl rollout status` and confirming no requests fail while pods are replaced.

## Runbooks

Step-by-step runbooks for deployment, rollback, incident response, scaling, backups, alerts, password resets, data export, user management and database maintenance are in [`docs/runbooks/`](https://github.com/Health-watchers/health_watchers/tree/main/docs/runbooks).
