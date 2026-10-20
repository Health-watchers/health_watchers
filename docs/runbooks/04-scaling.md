# Scaling Procedures Runbook

**Service:** Health Watchers  
**Stack:** Kubernetes, Node.js, MongoDB, Redis  
**Last Updated:** 2026-08-30  
**Owner:** Platform Engineering  

---

## Overview

The platform runs three services on Kubernetes: `api`, `web`, and `stellar-service`. Each scales independently. MongoDB is the primary data store — scaling it has different considerations than stateless application pods.

---

## When to Scale

Monitor the following signals in Grafana / Prometheus before scaling:

| Metric | Warning | Critical | Action |
|---|---|---|---|
| CPU usage (API pods) | > 60% avg | > 80% avg | Scale out pods |
| Memory usage | > 70% | > 85% | Scale out or increase limits |
| Request latency p95 | > 300ms | > 500ms | Scale out pods |
| MongoDB pool utilisation | > 80% | > 95% | Scale out API pods or increase pool |
| MongoDB wait queue | > 0 for 5+ min | > 10 sustained | Scale out API pods |
| Redis connection errors | Any | — | Check Redis instance sizing |

---

## Horizontal Pod Autoscaling (HPA)

The cluster should have HPA configured. Check current autoscaler status:

```bash
kubectl get hpa -n health-watchers
kubectl describe hpa api -n health-watchers
```

### Manually adjust replica count (immediate scaling)

```bash
# Scale API service
kubectl scale deployment/api --replicas=<N> -n health-watchers

# Scale Web service
kubectl scale deployment/web --replicas=<N> -n health-watchers

# Scale Stellar service
kubectl scale deployment/stellar-service --replicas=<N> -n health-watchers

# Watch pod rollout
kubectl get pods -n health-watchers -w
```

**Recommended minimum replica counts:**

| Environment | api | web | stellar-service |
|---|---|---|---|
| Staging | 1 | 1 | 1 |
| Production (normal) | 2 | 2 | 1 |
| Production (high load) | 4–6 | 3–4 | 2 |

**Time estimate:** 2–3 minutes for pods to become ready

---

## Important: Redis Required for Multi-Replica API

When running more than 1 API replica, `REDIS_URL` **must** be set. Without Redis, rate limiting is per-pod only, which allows brute-force bypass by distributing requests across pods. Verify:

```bash
kubectl exec -it deployment/api -n health-watchers -- \
  printenv REDIS_URL
```

If empty, set the secret and restart:
```bash
kubectl set env deployment/api REDIS_URL=redis://<host>:<port> -n health-watchers
```

---

## MongoDB Connection Pool Tuning

Each API pod maintains a connection pool to MongoDB. Default pool size is 10 per pod.

With N pods: `total connections = N × MONGODB_POOL_SIZE`

MongoDB Atlas free tier supports 500 connections; M10 supports 1500. Calculate before scaling.

```bash
# Check current pool metrics (per-pod)
GET /api/v2/health/db-pool

# Adjust pool size per pod via env var
kubectl set env deployment/api MONGODB_POOL_SIZE=<size> -n health-watchers
```

| API replicas | Recommended pool size per pod | Total connections |
|---|---|---|
| 1 | 10 | 10 |
| 2 | 8 | 16 |
| 4 | 6 | 24 |
| 6 | 5 | 30 |

---

## Vertical Scaling (resource limits)

If horizontal scaling is not sufficient, increase resource limits in the Helm values or Kubernetes manifests:

```yaml
# Example: increase API pod resources
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "1000m"
    memory: "1Gi"
```

Apply with:
```bash
kubectl edit deployment/api -n health-watchers
# or via Helm upgrade with updated values
```

**Time estimate:** 5 minutes for rolling restart to complete

---

## MongoDB Scaling

MongoDB scaling depends on your deployment type:

### MongoDB Atlas
1. Go to Atlas → Cluster → **Modify**
2. Select a larger tier (e.g. M10 → M20)
3. Atlas performs a live rolling upgrade — no downtime
4. **Time estimate:** 10–30 minutes

### Self-hosted MongoDB (replica set)
1. Add a new secondary member to the replica set
2. Allow it to sync (may take time depending on data size)
3. Once in sync, it will automatically participate in reads
4. Promote to primary if needed via `rs.stepDown()` on current primary

```bash
# Connect to MongoDB
kubectl exec -it deployment/mongodb -n health-watchers -- mongosh

# Check replica set status
rs.status()

# Add a new member
rs.add("<new-member-host>:27017")
```

**Time estimate:** 30–120 minutes depending on data size

---

## Scaling Down (post-peak)

Scale down gradually — do not drop from 6 to 1 instantly.

```bash
# Step down by 1–2 replicas at a time, watching metrics
kubectl scale deployment/api --replicas=4 -n health-watchers
# wait 5 min, watch latency
kubectl scale deployment/api --replicas=2 -n health-watchers
```

Verify PodDisruptionBudgets are not blocking:
```bash
kubectl get pdb -n health-watchers
```

---

## Grafana Dashboards for Scaling Decisions

- **API Health Overview** — request rate, error rate, latency
- **DB Pool Utilisation** — pool usage, wait queue, connection count
- **Kubernetes Pod Metrics** — CPU, memory per pod
- **Node Exporter** — host-level CPU and memory (port 9100)

---

## Related Runbooks

- [Deployment Runbook](./01-deployment.md)
- [Incident Response](./03-incident-response.md)
- [Database Maintenance](./10-database-maintenance.md)
