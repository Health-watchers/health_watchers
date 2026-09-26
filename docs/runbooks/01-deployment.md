# Deployment Runbook

**Service:** Health Watchers API + Web + Stellar Service  
**Stack:** Node.js 20, Express, TypeScript, MongoDB 7, Redis, Kubernetes + Helm, GitHub Actions  
**Last Updated:** 2026-08-30  
**Owner:** Platform Engineering  

---

## Overview

Deployments are triggered via GitHub Actions (`deploy.yml`). All services are containerised (Docker) and deployed to Kubernetes via Helm. There are two target environments: **staging** and **production**.

---

## Pre-Deployment Checklist

- [ ] CI pipeline is green on the target branch (`main` for production, `develop` for staging)
- [ ] All required environment secrets are set in GitHub Secrets
- [ ] Kubernetes manifests have been validated by `kubeconform`
- [ ] A changeset entry exists for the release (checked by `changeset-check.yml`)
- [ ] Backup completed successfully within the last 24 hours (verify in GitHub Actions → `backup.yml`)
- [ ] Notify the team in the incident Slack channel (`#deployments`) before starting

---

## Deployment Steps

### Staging Deployment (~10–15 min)

1. Go to **GitHub → Actions → Deployment Pipeline**
2. Click **Run workflow**
3. Select:
   - **environment:** `staging`
   - **version:** leave empty for `latest`, or enter a specific image tag (e.g. `v1.4.2`)
4. Click **Run workflow**
5. Monitor the run — steps in order:
   - `validate-deployment` — validates Kubernetes manifests and resolves image tag
   - `deploy-staging` — applies Helm chart to the `health-watchers` namespace on the staging cluster
6. Once complete, verify at `https://staging.health-watchers.app/api/health`

```
Expected health response:
{ "status": "ok", "db": "connected", "uptime": <seconds> }
```

**Time estimate:** 10–15 minutes

---

### Production Deployment (~20–30 min)

> **Requires explicit approval from a second team member before the workflow proceeds.**

1. Confirm staging has been stable for at least 30 minutes
2. Go to **GitHub → Actions → Deployment Pipeline**
3. Click **Run workflow**
4. Select:
   - **environment:** `production`
   - **version:** exact image tag to promote (e.g. `v1.4.2`) — never use `latest` in production
5. Click **Run workflow**
6. A GitHub environment protection rule will pause and request approval — approve in the GitHub UI
7. Monitor steps:
   - `validate-deployment` — validates manifests
   - `deploy-production` — rolling update to production cluster
   - Kubernetes waits for rollout: `kubectl rollout status deployment/api -n health-watchers`
8. Post-deploy health checks:
   - API: `https://health-watchers.app/api/health`
   - Metrics: Grafana dashboard → *API Health Overview*
   - Errors: Sentry → *health-watchers-api* project → Last 15 minutes

**Time estimate:** 20–30 minutes

---

## Manual Deployment (emergency)

Only use this path when GitHub Actions is unavailable.

```bash
# 1. Authenticate with the cluster
mkdir -p ~/.kube
echo "$KUBE_CONFIG_PRODUCTION" | base64 -d > ~/.kube/config

# 2. Set the image (replace <TAG> with the target image tag)
REGISTRY="ghcr.io"
REPO="<your-org>/health-watchers"
TAG="v1.4.2"

kubectl set image deployment/api \
  api=$REGISTRY/$REPO/health-watchers-api:$TAG \
  -n health-watchers

kubectl set image deployment/web \
  web=$REGISTRY/$REPO/health-watchers-web:$TAG \
  -n health-watchers

# 3. Watch rollout
kubectl rollout status deployment/api -n health-watchers --timeout=5m
kubectl rollout status deployment/web -n health-watchers --timeout=5m

# 4. Verify pods are running
kubectl get pods -n health-watchers
```

**Time estimate:** 5–10 minutes

---

## Post-Deployment Verification

| Check | Command / URL | Expected |
|---|---|---|
| API health | `GET /api/health` | `{ "status": "ok" }` |
| DB connected | `GET /api/health` | `"db": "connected"` |
| No error spike | Sentry → last 15 min | No new unhandled errors |
| Metrics flowing | Prometheus → `up{job="api"}` | `1` |
| Response time | Grafana → API latency panel | p95 < 500ms |

---

## Environment Variables

All secrets are managed in GitHub Secrets and injected via Kubernetes secrets. Critical production vars:

| Variable | Purpose | Notes |
|---|---|---|
| `MONGO_URI` | Database connection | Must include auth credentials |
| `JWT_ACCESS_TOKEN_SECRET` | JWT signing | Min 32 chars |
| `JWT_REFRESH_TOKEN_SECRET` | JWT refresh signing | Min 32 chars |
| `FIELD_ENCRYPTION_KEY` | HIPAA PHI encryption | 64-char hex (AES-256), **required in prod** |
| `AUDIT_ENCRYPTION_KEY` | Audit log encryption | 64-char hex |
| `BACKUP_ENCRYPTION_KEY` | Backup encryption | Min 32 chars |
| `REDIS_URL` | Rate limiting store | Required for multi-replica deployments |
| `SENTRY_DSN` | Error tracking | Optional but strongly recommended |

---

## Rollback

If the deployment introduces regressions, follow the [Rollback Runbook](./02-rollback.md).
