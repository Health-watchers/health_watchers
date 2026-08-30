# Runbook: Application Recovery

**Use when:** the data layer is healthy but the application tier is down —
bad deploy, crash loop, corrupted config, exhausted resources, cluster node loss.
**Objective:** API RTO 15 min, Web RTO 30 min.
**Owner:** DevOps on-call.

## Triage (2 min)

```bash
kubectl -n health-watchers get pods,deploy,hpa
kubectl -n health-watchers get events --sort-by=.lastTimestamp | tail -30
kubectl -n health-watchers logs deploy/health-watchers-api --tail=100 --since=15m
```

Classify:

| Symptom | Go to |
|---------|-------|
| New version crash-looping / erroring | §1 Rollback |
| `CreateContainerConfigError` / missing env | §2 Config / secrets |
| `Pending` pods, `FailedScheduling` | §3 Capacity / nodes |
| Healthy pods but 5xx at the edge | §4 Ingress / dependency |

## 1. Rollback the deployment

```bash
kubectl -n health-watchers rollout history deploy/health-watchers-api
kubectl -n health-watchers rollout undo deploy/health-watchers-api        # to previous
# or a specific known-good revision:
kubectl -n health-watchers rollout undo deploy/health-watchers-api --to-revision=<n>
kubectl -n health-watchers rollout status deploy/health-watchers-api --timeout=300s
```

Helm-managed:

```bash
helm -n health-watchers history health-watchers
helm -n health-watchers rollback health-watchers <REVISION> --wait --timeout 10m
```

## 2. Config / secrets

```bash
# Is the ExternalSecret synced?
kubectl -n health-watchers describe externalsecret health-watchers-secrets | grep -A3 Status
# Force a resync:
kubectl -n health-watchers annotate externalsecret health-watchers-secrets force-sync=$(date +%s) --overwrite
# Validate the store side:
scripts/secrets/validate-secrets.sh --env production --store aws --k8s-check
```

If a secret is stale/rotated badly, roll it back:
`scripts/secrets/rotate-secret.sh --env production --rollback <secret>`.

## 3. Capacity / nodes

```bash
kubectl get nodes -o wide
kubectl -n health-watchers describe pod <pending-pod> | grep -A10 Events
```

- Scale the node group / let the autoscaler add nodes; if cost tooling recently
  changed instance types, check `ops/cost/karpenter-nodepool-spot.yaml`.
- Temporarily lower resource requests or replica counts to fit current capacity.
- If a spot pool was reclaimed en masse, shift the workload to the on-demand
  pool: `kubectl -n health-watchers patch deploy/health-watchers-api --type=json \
  -p '[{"op":"replace","path":"/spec/template/spec/nodeSelector","value":{"pool":"on-demand"}}]'`.

## 4. Ingress / dependency

```bash
kubectl -n health-watchers get ingress health-watchers -o wide
kubectl -n ingress-nginx logs deploy/ingress-nginx-controller --tail=100
# dependency health:
curl -fsS https://app.health-watchers.io/api/health/deep   # checks mongo, redis, stellar
```

- Mongo/Redis down → [`DR_DATABASE_RESTORE.md`](./DR_DATABASE_RESTORE.md) or
  restart the cache tier.
- CDN/edge returning 5xx while origin is 200 → `bash scripts/cdn/purge-cache.sh --all`
  and check the origin failover group.

## Verify recovery

```bash
curl -fsS https://app.health-watchers.io/health
curl -fsS https://app.health-watchers.io/api/health
kubectl -n health-watchers get pods    # all Running/Ready
```

Watch error rate + latency for 15 min on the API dashboard.

## Close out

- Status page "Resolved".
- If a bad deploy: add a regression test, note the gap in the post-mortem.
- Record measured RTO in `docs/DR_DRILL_LOG.md` if this was a drill.
