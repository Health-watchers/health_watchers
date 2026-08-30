# Disaster Recovery Runbook — Health Watchers

> Issue #1255 — disaster recovery procedures.

This runbook covers recovering the Health Watchers platform after data loss,
cluster loss, or a region-level outage.

## Objectives

| Scenario                         | RTO      | RPO      |
|----------------------------------|----------|----------|
| Single pod / node failure        | < 2 min  | 0        |
| MongoDB primary failure          | < 30 s   | 0 (replica set) |
| Namespace deletion               | < 30 min | ≤ 5 min  |
| Full cluster loss                | < 2 h    | ≤ 15 min |
| Region loss (DR to standby)      | < 4 h    | ≤ 15 min |

## What to back up

| Asset | Mechanism | Frequency | Location |
|-------|-----------|-----------|----------|
| MongoDB | `mongodump` CronJob → `backups` PVC → object storage; plus replica set | every 6 h full, oplog continuous | `s3://hw-backups/mongo/` |
| Redis | AOF (`appendonly yes`, `appendfsync everysec`) on `redis-data` PVC | continuous | in-cluster PVC (cache is rebuildable — not critical) |
| Secrets | External Secrets Operator; source of truth is AWS Secrets Manager / Vault | n/a (external) | secret manager, versioned |
| K8s manifests | this repo (`k8s/`, `helm/`) | on every merge | git |
| Object storage (documents, exports) | provider cross-region replication + versioning | continuous | `s3://hw-assets/` replicated to DR region |

Backup health is exported by the API (`/health/backup*`,
`backup-metrics.service.ts`) and alerted on via `k8s/prometheus-rules.yaml`.

## Recovery procedures

### 1. Pod / node failure

No action. Deployments run `replicas: 2+`, PDBs keep ≥1 pod during drains, HPAs
re-expand. The replica set re-elects a MongoDB primary automatically.

### 2. MongoDB data corruption / accidental deletion

```bash
# Scale the API down so nothing writes during restore
kubectl -n health-watchers scale deploy/api --replicas=0

# Restore the latest good dump into the primary
LATEST=$(aws s3 ls s3://hw-backups/mongo/ | sort | tail -1 | awk '{print $4}')
aws s3 cp "s3://hw-backups/mongo/$LATEST" /restore/dump.gz
kubectl -n health-watchers cp /restore/dump.gz mongodb-0:/tmp/dump.gz
kubectl -n health-watchers exec mongodb-0 -- \
  mongorestore --drop --gzip --archive=/tmp/dump.gz

# For point-in-time: replay the oplog up to a timestamp
#   mongorestore --oplogReplay --oplogLimit <ts> ...

kubectl -n health-watchers scale deploy/api --replicas=2
```

Verify with the checks in [Post-recovery verification](#post-recovery-verification).

### 3. Namespace deletion / cluster rebuild (same region)

```bash
# 1. Namespace, config, RBAC, storage
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/rbac.yaml -f k8s/service-accounts.yaml
kubectl apply -f k8s/storage/persistent-volume-claims.yaml

# 2. Secrets — via External Secrets Operator (preferred)
kubectl apply -f k8s/external-secrets.yaml
kubectl -n health-watchers wait --for=condition=Ready externalsecret --all --timeout=120s

# 3. Data tier
kubectl apply -f k8s/mongodb-replica-set-statefulset.yaml
kubectl apply -f k8s/redis/
kubectl -n health-watchers rollout status statefulset/mongodb --timeout=300s

# 4. Restore MongoDB data (see procedure 2) if the PVs were also lost

# 5. Application tier
kubectl apply -f k8s/api/ -f k8s/web/ -f k8s/stellar-service/

# 6. Edge + policy
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/network-policies.yaml
kubectl apply -f k8s/monitoring.yaml -f k8s/prometheus-rules.yaml

# 7. Logging sidecar (optional)
kubectl apply -f k8s/logging/fluent-bit-sidecar.yaml
```

If PVs survived (namespace deleted but storage retained with
`persistentVolumeReclaimPolicy: Retain`), re-bind by recreating the PVCs with
the same names — no data restore needed.

### 4. Region loss — fail over to the DR region

Pre-req: a warm standby cluster in the DR region with the same manifests and a
MongoDB replica set member (hidden, priority 0) replicating cross-region.

```bash
# 1. Point kubectl at the DR cluster
kubectl config use-context hw-dr

# 2. Promote the DR MongoDB member to a full voting member / new primary
kubectl -n health-watchers exec mongodb-0 -- mongosh --eval '
  cfg = rs.conf();
  cfg.members.forEach(m => { if (m.host.includes("dr-region")) { m.priority = 2; m.hidden = false; m.votes = 1; } });
  rs.reconfig(cfg, {force: true});
'

# 3. Bring up the app tier (data + secrets already present in DR)
kubectl apply -f k8s/api/ -f k8s/web/ -f k8s/stellar-service/
kubectl apply -f k8s/ingress.yaml -f k8s/network-policies.yaml

# 4. Update DNS: switch the app hostname to the DR ingress load balancer
#    (Route53 failover record / weighted record → 100% DR)
```

### 5. Secret compromise

Rotate in the secret manager → ESO propagates within its refresh interval (or
`kubectl annotate externalsecret <name> force-sync=$(date +%s)`), then
`kubectl -n health-watchers rollout restart deploy/api deploy/web deploy/stellar-service`.

## Post-recovery verification

```bash
kubectl -n health-watchers get pods,hpa,pdb
kubectl -n health-watchers exec deploy/api -- wget -qO- localhost:3001/health/ready
kubectl -n health-watchers exec mongodb-0 -- mongosh --quiet --eval 'rs.status().ok'
```

Checklist:

- [ ] all Deployments `Available`, HPAs show a live target (not `<unknown>`)
- [ ] `/health/ready` returns 200; `/health/backup` shows a recent successful backup
- [ ] MongoDB `rs.status()` — one `PRIMARY`, majority of members `SECONDARY`
- [ ] a synthetic login + patient read + payment-intent create succeeds
- [ ] NetworkPolicies present (`kubectl get netpol`) — `default-deny-all` first
- [ ] Prometheus targets for api/web/stellar are `UP`
- [ ] no `CrashLoopBackOff`; error rate back to baseline in Grafana

## DR testing

Run quarterly in a scratch namespace / cluster:

1. Restore the latest MongoDB backup into a throwaway namespace.
2. Deploy the full stack against it using procedure 3.
3. Run the verification checklist + the e2e smoke suite.
4. Record actual RTO/RPO achieved and file issues for any step that needed
   manual improvisation.
5. Tear down.

Track results in the ops log; a DR test that has not been run in 6 months is
treated as a failing control.
