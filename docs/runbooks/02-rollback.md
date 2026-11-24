# Rollback Procedures Runbook

**Service:** Health Watchers API + Web + Stellar Service  
**Stack:** Kubernetes, Helm, GitHub Actions, MongoDB  
**Last Updated:** 2026-08-30  
**Owner:** Platform Engineering  

---

## Overview

This runbook covers rolling back a bad deployment. Kubernetes native rollback (image revert) handles application code regressions. Database migration rollbacks are a separate, more involved process described below.

---

## Decision Tree

```
Deployment bad?
│
├─ Application crash / error spike / failed health check
│   └─ → Step 1: Kubernetes Image Rollback (< 5 min)
│
├─ Data corruption / wrong schema after migration
│   └─ → Step 2: Database Migration Rollback (15–30 min)
│
└─ Both
    └─ → Step 2 first, then Step 1
```

---

## Step 1: Kubernetes Image Rollback

Use when the new image is behaving incorrectly. Kubernetes keeps the last few ReplicaSets by default.

### Option A — Automated (GitHub Actions)

1. Go to **GitHub → Actions → Deployment Pipeline**
2. Run the workflow with the **previous known-good image tag**
3. The pipeline will perform a rolling update back to that image

**Time estimate:** 10–15 minutes

---

### Option B — kubectl (immediate, < 5 min)

```bash
# View rollout history to find the previous revision
kubectl rollout history deployment/api -n health-watchers
kubectl rollout history deployment/web -n health-watchers
kubectl rollout history deployment/stellar-service -n health-watchers

# Roll back to the previous revision
kubectl rollout undo deployment/api -n health-watchers
kubectl rollout undo deployment/web -n health-watchers
kubectl rollout undo deployment/stellar-service -n health-watchers

# Or roll back to a specific revision number
kubectl rollout undo deployment/api --to-revision=<REVISION_NUMBER> -n health-watchers

# Watch rollout completion
kubectl rollout status deployment/api -n health-watchers --timeout=5m

# Verify pods are healthy
kubectl get pods -n health-watchers
kubectl describe pod <pod-name> -n health-watchers
```

**Time estimate:** 3–5 minutes

---

## Step 2: Database Migration Rollback

Use when a database schema migration caused data issues. This is irreversible if data has been written in the new schema — take a backup first.

### Pre-conditions

- [ ] Confirm current migration status
- [ ] Confirm a valid backup exists from before the migration
- [ ] Notify the team — this will cause a brief write outage

```bash
# Check current migration status
cd apps/api
npm run migrate:status
```

### Rollback a Single Migration

```bash
# Roll back the most recently applied migration
npm run migrate:down

# Confirm status again
npm run migrate:status
```

### Rollback Multiple Migrations

`migrate-mongo down` rolls back one migration at a time. Repeat until you reach the desired state.

```bash
npm run migrate:down  # repeat as needed
npm run migrate:status
```

**Time estimate:** 15–30 minutes depending on data volume

---

## Step 3: Restore from Backup (last resort)

Use only when data is corrupted beyond what a migration rollback can fix.

See [Backup Procedures Runbook](./05-backup.md) — **Restore** section.

**Time estimate:** 30–120 minutes depending on database size

---

## Post-Rollback Verification

| Check | Command / URL | Expected |
|---|---|---|
| API health | `GET /api/health` | `{ "status": "ok" }` |
| DB connected | `GET /api/health` | `"db": "connected"` |
| Error rate | Sentry → last 15 min | Back to baseline |
| Pod status | `kubectl get pods -n health-watchers` | All `Running` |
| Metrics | Grafana → API Error Rate panel | Back to baseline |

---

## Communication Template

Post to `#incidents` after completing rollback:

```
[ROLLBACK COMPLETE]
Service: health-watchers-api
Rolled back from: v<BAD_TAG>
Rolled back to:   v<GOOD_TAG>
Reason: <brief description>
Duration of incident: <X> minutes
Status: All systems nominal
Post-mortem scheduled: <date/time>
```

---

## Notes

- Kubernetes by default keeps `revisionHistoryLimit: 10` ReplicaSets per deployment.
- If `revisionHistoryLimit` has been reduced, older revisions may not be available — use the GitHub Actions deploy with a specific image tag instead.
- JWT tokens issued under the old code may or may not be valid after rollback depending on whether secrets changed — if in doubt, rotate `JWT_ACCESS_TOKEN_SECRET` and `JWT_REFRESH_TOKEN_SECRET` (this will force all users to re-login).
