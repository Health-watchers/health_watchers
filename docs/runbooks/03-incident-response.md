# Incident Response Runbook

**Service:** Health Watchers  
**Compliance:** HIPAA — incidents involving PHI are subject to § 164.410 breach notification  
**Last Updated:** 2026-08-30  
**Owner:** Platform Engineering + Security  

---

## Severity Levels

| Level | Description | Response Time | Examples |
|---|---|---|---|
| **SEV-1** | Complete outage or PHI data breach | Immediate (< 15 min) | API down, DB unreachable, data leak |
| **SEV-2** | Major feature degraded, data integrity risk | < 30 min | Auth broken, payments failing, high error rate |
| **SEV-3** | Non-critical feature broken | < 2 hours | Minor UI bug, slow endpoint, non-critical job failing |
| **SEV-4** | Cosmetic / low-impact | Next business day | Typo, minor layout issue |

---

## Incident Response Phases

### Phase 1 — Detect (0–5 min)

Incidents are detected through:
- **Prometheus + AlertManager** alerts (see [Monitoring Alert Runbook](./06-monitoring-alerts.md))
- **Sentry** error spike notifications
- **GitHub Actions** backup failure issues created automatically
- **User reports** via support channels

**First responder actions:**
1. Acknowledge the alert in AlertManager or Sentry
2. Post in `#incidents` Slack channel:
   ```
   [INCIDENT STARTED] SEV-<level>
   Service: <service>
   Symptom: <what is wrong>
   Investigating: @<your-name>
   ```
3. Open a war room (Slack huddle or video call) for SEV-1/2

---

### Phase 2 — Triage (5–15 min)

**Check dashboards in this order:**

1. **API health endpoint**
   ```
   GET https://health-watchers.app/api/health
   ```
   Expected: `{ "status": "ok", "db": "connected" }`

2. **Kubernetes pod status**
   ```bash
   kubectl get pods -n health-watchers
   kubectl get events -n health-watchers --sort-by='.lastTimestamp' | tail -20
   ```

3. **Application logs** (Pino structured JSON logs)
   ```bash
   kubectl logs -l app=api -n health-watchers --tail=200 --timestamps
   # Filter for errors only
   kubectl logs -l app=api -n health-watchers --tail=500 | grep '"level":50'
   ```

4. **Sentry** — check for new error groups in the last 30 minutes
   - Project: `health-watchers-api`
   - Look for unhandled exceptions, auth failures, DB errors

5. **Prometheus / Grafana**
   - URL: `http://<grafana-host>:3100`
   - Key panels: API Error Rate, DB Pool Utilisation, Request Latency p95, Redis connection status

6. **MongoDB connectivity**
   ```bash
   kubectl exec -it deployment/api -n health-watchers -- \
     node -e "require('./dist/config/db').connectDB().then(() => console.log('ok'))"
   ```

---

### Phase 3 — Contain (15–60 min)

#### API is completely down

```bash
# Check if pods are crashing
kubectl describe pod <pod-name> -n health-watchers

# Check recent deployments
kubectl rollout history deployment/api -n health-watchers

# If a recent deployment is the cause, roll back immediately
kubectl rollout undo deployment/api -n health-watchers
kubectl rollout status deployment/api -n health-watchers --timeout=5m
```

#### Database unreachable

```bash
# Check MongoDB pod/service
kubectl get pods -n health-watchers -l app=mongodb
kubectl logs -l app=mongodb -n health-watchers --tail=100

# Check connection pool metrics via API
GET /api/v2/health/db-pool

# If using Atlas or managed MongoDB — check provider status page
```

#### High error rate (not a crash)

```bash
# Check logs for error patterns
kubectl logs -l app=api -n health-watchers --tail=1000 | \
  python3 -c "import sys,json; [print(l['msg']) for l in [json.loads(x) for x in sys.stdin] if l.get('level',0) >= 50]"
```

#### Redis down (rate limiting degraded)

If Redis is unavailable, rate limiting falls back to in-memory (per-pod, not shared). This is a security risk in multi-replica deployments. Check the API logs for:
```
WARNING: REDIS_URL is not set in production
```

Restore Redis and restart pods if needed:
```bash
kubectl rollout restart deployment/api -n health-watchers
```

#### Suspected PHI data breach (HIPAA SEV-1)

1. **Do not delete any evidence** — preserve logs and configs
2. Immediately escalate to Security Officer and Legal
3. Isolate affected resources if breach is ongoing:
   ```bash
   # Scale down the affected service temporarily
   kubectl scale deployment/api --replicas=0 -n health-watchers
   ```
4. Document timeline, scope, and affected records
5. HIPAA § 164.410 requires notification to affected individuals within 60 days — begin this process immediately
6. If SMTP is configured, the automated breach notification system will assist

---

### Phase 4 — Resolve

1. Apply fix (code hotfix → CI → deploy, or rollback)
2. Verify all health checks pass (see [Deployment Runbook — Post-Deploy Verification](./01-deployment.md))
3. Monitor for 30 minutes post-resolution

---

### Phase 5 — Post-Mortem (within 48 hours)

Create a post-mortem document covering:

- **Timeline** — when detected, when resolved
- **Root cause** — technical cause
- **Impact** — services affected, user impact, data impact
- **Resolution** — what fixed it
- **Action items** — specific, assigned, time-boxed improvements

Post-mortem template location: `.github/PULL_REQUEST_TEMPLATE.md` (adapt as needed)

---

## Useful Commands Reference

```bash
# Get all pods across namespaces
kubectl get pods -A

# Tail logs from all API replicas
kubectl logs -l app=api -n health-watchers -f --max-log-requests=10

# Describe a pod (events, resource limits, restarts)
kubectl describe pod <pod-name> -n health-watchers

# Port-forward API locally for testing
kubectl port-forward deployment/api 3001:3001 -n health-watchers

# Get current resource usage
kubectl top pods -n health-watchers

# Force restart all pods (preserves replica count)
kubectl rollout restart deployment/api -n health-watchers
kubectl rollout restart deployment/web -n health-watchers
kubectl rollout restart deployment/stellar-service -n health-watchers
```

---

## Escalation Contacts

| Role | When to Escalate |
|---|---|
| On-call Engineer | SEV-1/2 at any time |
| Security Officer | Any suspected PHI breach |
| Database Admin | Data corruption, migration failures |
| Legal / Compliance | Confirmed PHI breach (HIPAA notification obligation) |
| Cloud Provider Support | Infrastructure outages (AWS/GCP/Azure) |

---

## Related Runbooks

- [Rollback Procedures](./02-rollback.md)
- [Monitoring Alert Runbooks](./06-monitoring-alerts.md)
- [Backup Procedures](./05-backup.md)
- [Database Maintenance](./10-database-maintenance.md)
