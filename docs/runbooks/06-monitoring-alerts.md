# Monitoring Alert Runbooks

**Service:** Health Watchers  
**Stack:** Prometheus, Grafana, AlertManager, Sentry, OpenTelemetry / Jaeger  
**Last Updated:** 2026-08-30  
**Owner:** Platform Engineering  

---

## Monitoring Stack

| Tool | URL | Purpose |
|---|---|---|
| Grafana | `http://<host>:3100` | Dashboards and visualisation |
| Prometheus | `http://<host>:9090` | Metrics collection and alerting rules |
| AlertManager | `http://<host>:9093` | Alert routing, grouping, silencing |
| Jaeger | `http://<host>:16686` | Distributed tracing |
| Sentry | `https://sentry.io` | Error tracking and crash reporting |

---

## Alert: API Down / Health Check Failing

**Source:** Prometheus `up{job="api"} == 0`  
**Severity:** SEV-1  

**Steps:**
1. Check pod status:
   ```bash
   kubectl get pods -n health-watchers -l app=api
   ```
2. Check recent events:
   ```bash
   kubectl get events -n health-watchers --sort-by='.lastTimestamp' | tail -20
   ```
3. Read pod logs:
   ```bash
   kubectl logs -l app=api -n health-watchers --tail=200
   ```
4. Check if a bad deployment caused the crash:
   ```bash
   kubectl rollout history deployment/api -n health-watchers
   ```
5. If deployment-caused → [Rollback](./02-rollback.md)
6. If env var issue → check env validation output in logs for `❌ Environment validation failed`
7. If DB connection issue → see **MongoDB Unreachable** alert below

**Time estimate to resolve:** 5–20 minutes

---

## Alert: High Error Rate

**Source:** Prometheus `rate(http_requests_total{status=~"5.."}[5m]) > 0.05`  
**Severity:** SEV-2  

**Steps:**
1. Open Sentry → `health-watchers-api` → filter last 30 minutes
2. Identify the top error group and its stack trace
3. Check API logs for the error pattern:
   ```bash
   kubectl logs -l app=api -n health-watchers --tail=500 | grep '"level":50'
   ```
4. Correlate with recent deployments:
   ```bash
   kubectl rollout history deployment/api -n health-watchers
   ```
5. If a code bug: hotfix and deploy, or rollback
6. If a dependency (DB, Redis, Stellar): check those services

**Time estimate to resolve:** 15–45 minutes

---

## Alert: High Request Latency

**Source:** Prometheus `histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m])) > 500`  
**Severity:** SEV-2  

**Steps:**
1. Open Grafana → **API Health Overview** → latency panels
2. Check if latency is global or endpoint-specific
3. Open Jaeger → search for slow traces (duration > 500ms) in the last 30 minutes
4. Common causes:
   - **MongoDB slow queries**: check MongoDB logs or Atlas Performance Advisor
   - **Pool exhaustion**: `GET /api/v2/health/db-pool` — check `waitQueueSize`
   - **CPU saturation**: `kubectl top pods -n health-watchers`
   - **Cold start after scaling**: wait 2–3 minutes for JIT to warm up
5. If pool exhausted → see [Scaling Procedures](./04-scaling.md)
6. If slow query → see [Database Maintenance](./10-database-maintenance.md) — Index Review section

**Time estimate to resolve:** 15–60 minutes

---

## Alert: MongoDB Pool Near Exhaustion

**Source:** Prometheus `mongodb_pool_utilization > 0.80`  
**Severity:** SEV-2 (warning at 80%, critical at 95%)  

**Steps:**
1. Check current pool metrics:
   ```
   GET /api/v2/health/db-pool
   ```
   Look at `waitQueueSize` — if > 0, requests are queueing.
2. Check how many API replicas are running:
   ```bash
   kubectl get deployment/api -n health-watchers
   ```
3. Either:
   - Reduce pool size per pod: `MONGODB_POOL_SIZE` env var
   - Or scale out pods (improves throughput, but increases total connections)
   - Or scale up MongoDB tier if approaching instance connection limit
4. See [Scaling Procedures](./04-scaling.md)

**Time estimate to resolve:** 5–30 minutes

---

## Alert: Database Replication Lag

**Source:** Prometheus `mongodb_replication_lag_seconds > 30`  
**Severity:** SEV-2  

**Steps:**
1. Connect to MongoDB replica set:
   ```bash
   kubectl exec -it deployment/mongodb -n health-watchers -- mongosh
   rs.status()
   ```
2. Look for members with `stateStr: "SECONDARY"` and high `optimeDate` lag
3. Common causes:
   - Write-heavy workload overwhelming secondary
   - Network partition between nodes
   - Secondary disk I/O saturation
4. If lag > 5 minutes, consider routing read traffic to primary only
5. If a secondary is stuck: `rs.remove("<host>")`, fix it, then `rs.add("<host>")`

**Time estimate to resolve:** 15–120 minutes

---

## Alert: Backup Failed

**Source:** GitHub Issues auto-created with label `backup, incident`  
**Severity:** SEV-2  

**Steps:**
1. Find the failed GitHub Actions run (link in the issue body)
2. Read the error output
3. Fix the root cause (see [Backup Runbook — Backup Failure Response](./05-backup.md))
4. Re-run the workflow manually to confirm it passes
5. Close the GitHub Issue

**Time estimate to resolve:** 15–30 minutes

---

## Alert: High Rate Limit Violations

**Source:** Prometheus `rate(rate_limit_exceeded_total[5m]) > 1`  
**Severity:** SEV-3 (could be SEV-2 if attack)  

**Steps:**
1. Check which endpoint and source IP:
   ```bash
   kubectl logs -l app=api -n health-watchers --tail=500 | grep "rate limit"
   ```
2. If it's a single IP hammering the API → consider blocking at the load balancer/WAF level
3. If distributed and looks like an attack → escalate to Security
4. If it's a legitimate user hitting limits → review rate limit config via `GET /api/v2/rate-limit-config`

**Time estimate to resolve:** 10–30 minutes

---

## Alert: Certificate / TLS Expiry

**Source:** External monitoring or Prometheus blackbox exporter  
**Severity:** SEV-1 if expired, SEV-2 if < 14 days  

**Steps:**
1. Check certificate expiry:
   ```bash
   echo | openssl s_client -connect health-watchers.app:443 2>/dev/null | \
     openssl x509 -noout -dates
   ```
2. If using cert-manager on Kubernetes:
   ```bash
   kubectl get certificates -n health-watchers
   kubectl describe certificate <cert-name> -n health-watchers
   ```
3. If not auto-renewing, manually renew via your CA

**Time estimate to resolve:** 15–60 minutes

---

## Alert: MFA Grace Period Expiry Job Failing

**Source:** Application logs / Sentry  
**Severity:** SEV-3  

**Steps:**
1. Check job logs in Sentry or application logs
2. Common cause: MongoDB query timeout or schema mismatch after migration
3. Restart the pod to clear transient issues:
   ```bash
   kubectl rollout restart deployment/api -n health-watchers
   ```
4. If persistent, check recent migrations: `npm run migrate:status`

---

## Alert: Payment Expiration / Reconciliation Job Failing

**Source:** Application logs / Sentry  
**Severity:** SEV-2 (financial impact)  

**Steps:**
1. Check Sentry for the error details
2. Check Stellar network status: `https://status.stellar.org`
3. Check `STELLAR_NETWORK` env var matches expected network (`testnet` vs `mainnet`)
4. Restart the pod if transient:
   ```bash
   kubectl rollout restart deployment/stellar-service -n health-watchers
   ```

---

## Silencing Alerts (planned maintenance)

To silence an alert during planned maintenance:
1. Open AlertManager UI: `http://<host>:9093`
2. Click **New Silence**
3. Set matchers (e.g. `alertname="APIDown"`)
4. Set duration (e.g. 2 hours)
5. Add a comment with the maintenance reason
6. Click **Create**

Remember to remove the silence after maintenance completes.

---

## Grafana Dashboard Quick Reference

| Dashboard | Key Panels |
|---|---|
| API Health Overview | Request rate, error rate, latency p50/p95/p99 |
| DB Pool Utilisation | Pool size, wait queue, connections used |
| Kubernetes Resources | CPU/memory per pod, restart count |
| Business Metrics | Payment volumes, appointment counts |
| Security Events | Rate limit violations, auth failures, CSP reports |

---

## Related Runbooks

- [Incident Response](./03-incident-response.md)
- [Scaling Procedures](./04-scaling.md)
- [Database Maintenance](./10-database-maintenance.md)
