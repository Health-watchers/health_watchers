# Database Maintenance Procedures Runbook

**Service:** Health Watchers  
**Database:** MongoDB 7.0 (mongoose ODM)  
**Last Updated:** 2026-08-30  
**Owner:** Platform Engineering / DBA  

---

## Overview

This runbook covers routine and emergency MongoDB maintenance: migrations, index management, connection pool tuning, replica set health, compaction, and data retention enforcement. Always take a backup before any destructive maintenance operation.

---

## Pre-Maintenance Checklist

- [ ] Backup completed and verified (see [Backup Runbook](./05-backup.md))
- [ ] Maintenance window communicated to the team
- [ ] Scale API pods down if writes must be paused: `kubectl scale deployment/api --replicas=0 -n health-watchers`
- [ ] AlertManager silence created for the maintenance window (see [Monitoring Runbook](./06-monitoring-alerts.md))

---

## Database Migrations

Migrations are managed with `migrate-mongo`. Migration files live in `apps/api/src/migrations/`.

### Check migration status

```bash
cd apps/api
npm run migrate:status
```

Output shows which migrations are `up` (applied) or `down` (pending).

### Run pending migrations (up)

```bash
cd apps/api
npm run migrate:up
```

Runs all pending migrations in sequence. Safe to run multiple times — already-applied migrations are skipped.

**Time estimate:** 1–30 minutes depending on data volume

### Roll back the last migration

```bash
cd apps/api
npm run migrate:down
```

Rolls back one migration. Repeat for multiple. Always verify with `migrate:status` after.

**Time estimate:** 5–30 minutes

### Create a new migration

```bash
cd apps/api
npm run migrate:create -- <migration-name>
# e.g. npm run migrate:create -- add-patient-risk-score-index
```

Edit the generated file in `src/migrations/`. Every migration must implement both `up` and `down`.

---

## Index Management

Indexes are critical for query performance. Missing or inefficient indexes are the most common cause of latency spikes.

### List all indexes on a collection

```bash
kubectl exec -it deployment/mongodb -n health-watchers -- mongosh \
  "mongodb://admin:<password>@localhost:27017/health_watchers?authSource=admin" \
  --eval "db.patients.getIndexes()"
```

### Identify slow queries

```bash
# Enable the profiler for queries slower than 100ms
kubectl exec -it deployment/mongodb -n health-watchers -- mongosh \
  "mongodb://admin:<password>@localhost:27017/health_watchers?authSource=admin" \
  --eval "db.setProfilingLevel(1, { slowms: 100 })"

# After some traffic, read the profiler output
kubectl exec -it deployment/mongodb -n health-watchers -- mongosh \
  "mongodb://admin:<password>@localhost:27017/health_watchers?authSource=admin" \
  --eval "db.system.profile.find().sort({ ts: -1 }).limit(20).pretty()"

# Disable profiler when done (it has overhead)
kubectl exec -it deployment/mongodb -n health-watchers -- mongosh \
  "mongodb://admin:<password>@localhost:27017/health_watchers?authSource=admin" \
  --eval "db.setProfilingLevel(0)"
```

### Create an index (non-blocking — use background build)

```bash
# In mongosh — use background build for production (does not block reads/writes)
db.patients.createIndex(
  { clinicId: 1, riskScore: -1 },
  { background: true, name: "idx_patients_clinic_risk" }
)
```

> In MongoDB 4.2+, all index builds are non-blocking by default. `background: true` is still safe to include for clarity.

### Drop an unused index

```bash
# Verify the index is truly unused first — check Atlas or profiler stats
db.patients.dropIndex("idx_name_here")
```

**Time estimate:** Index build: 5–60 minutes depending on collection size

---

## Connection Pool Monitoring

Check current pool metrics via the API health endpoint:

```bash
curl https://health-watchers.app/api/v2/health/db-pool
```

Expected response shape:
```json
{
  "status": "connected",
  "totalConnections": 8,
  "availableConnections": 6,
  "waitQueueSize": 0,
  "maxPoolSize": 10,
  "minPoolSize": 2,
  "utilization": 0.8
}
```

**Thresholds:**

| Metric | Warning | Action |
|---|---|---|
| `utilization` | > 0.80 | Reduce pool per pod or scale out |
| `waitQueueSize` | > 0 for 5+ min | Scale out API pods immediately |
| `availableConnections` | 0 | Reduce pool per pod urgently |

**Tunable environment variables:**

| Variable | Default | Description |
|---|---|---|
| `MONGODB_POOL_SIZE` | 10 | Max connections per pod |
| `MONGODB_MIN_POOL_SIZE` | 2 | Min connections per pod |
| `MONGODB_MAX_CONNECTING` | 2 | Max concurrent connection attempts |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | 5000 | Timeout to find a usable server |
| `MONGODB_SOCKET_TIMEOUT_MS` | 45000 | Timeout for socket inactivity |
| `MONGODB_CONNECT_TIMEOUT_MS` | 10000 | Initial connection timeout |
| `MONGODB_HEARTBEAT_FREQUENCY_MS` | 10000 | How often to check server health |
| `MONGODB_WAIT_QUEUE_TIMEOUT_MS` | 5000 | How long a request waits for a connection |

Apply changes:
```bash
kubectl set env deployment/api \
  MONGODB_POOL_SIZE=8 \
  MONGODB_MIN_POOL_SIZE=2 \
  -n health-watchers
# Triggers a rolling restart automatically
```

---

## Replica Set Health Check

```bash
kubectl exec -it deployment/mongodb -n health-watchers -- mongosh \
  "mongodb://admin:<password>@localhost:27017/?authSource=admin" \
  --eval "rs.status()"
```

Key fields to check:
- `members[*].stateStr` — should be `PRIMARY` (one) and `SECONDARY` (others). `RECOVERING` means a member is catching up — monitor until it becomes `SECONDARY`.
- `members[*].optimeDate` — secondary lag. Lag > 30s is a warning, > 5min is critical.
- `members[*].health` — should be `1` for all members.

### Force a primary election (planned maintenance)

```bash
# Connect to current primary, then step down gracefully
kubectl exec -it deployment/mongodb -n health-watchers -- mongosh \
  "mongodb://admin:<password>@localhost:27017/?authSource=admin" \
  --eval "rs.stepDown(60)"  # 60s cooldown before re-election
```

**Time estimate:** < 30 seconds for re-election

---

## Data Retention Enforcement

HIPAA requires clinical records to be kept for a minimum of 6 years. The platform uses configurable retention periods:

| Data type | Env var | Default |
|---|---|---|
| Clinical records | `CLINICAL_RETENTION_YEARS` | 7 years |
| Audit logs | `AUDIT_LOG_RETENTION_YEARS` | 6 years |

### Check records eligible for purge (do not delete without legal sign-off)

```bash
# In mongosh — find audit logs older than retention period
RETENTION_YEARS=6
CUTOFF=$(new Date(Date.now() - RETENTION_YEARS * 365.25 * 24 * 60 * 60 * 1000))

db.auditlogs.countDocuments({ createdAt: { $lt: CUTOFF } })
```

### Purge expired records (requires legal/compliance approval)

> **Do not run without written approval from the Compliance Officer.**

```bash
# Dry run first — count only
db.auditlogs.countDocuments({ createdAt: { $lt: new Date("<cutoff-date>") } })

# If approved, delete in batches to avoid locking
let deleted = 0;
do {
  const result = db.auditlogs.deleteMany(
    { createdAt: { $lt: new Date("<cutoff-date>") } },
    { limit: 1000 }
  );
  deleted += result.deletedCount;
  print("Deleted so far:", deleted);
  sleep(100); // brief pause between batches
} while (result.deletedCount > 0);
```

**Time estimate:** Variable. Plan a maintenance window. Document the purge in compliance records.

---

## Database Compaction (free disk space)

After large deletes, run `compact` to reclaim disk space. This blocks the collection for the duration.

```bash
# Run on a SECONDARY to avoid impacting reads/writes on primary
# Connect to a secondary member first
kubectl exec -it deployment/mongodb-secondary -n health-watchers -- mongosh \
  "mongodb://admin:<password>@localhost:27017/health_watchers?authSource=admin" \
  --eval "db.runCommand({ compact: 'patients' })"
```

**Time estimate:** 5–60 minutes depending on collection size

---

## Common Maintenance Tasks Schedule

| Task | Frequency | Who |
|---|---|---|
| Check migration status | Before every deployment | Engineer |
| Review slow query log | Weekly | DBA |
| Check replica set health | Weekly | DBA |
| Review connection pool metrics | Weekly | DBA |
| Verify backup integrity | Weekly (automated) | Automated / DBA |
| Review index usage stats | Monthly | DBA |
| Data retention audit | Annually | DBA + Compliance |
| Database compaction | As needed (after large deletes) | DBA |

---

## Emergency: Corrupt Data / Unintended Delete

1. **Stop writes immediately**: scale API to 0 replicas
2. Identify the scope of corruption from the audit log
3. Restore from the most recent clean backup (see [Backup Runbook — Restore](./05-backup.md))
4. Roll back migrations if the corruption was migration-caused (see [Rollback Runbook](./02-rollback.md))
5. Replay any legitimate writes that occurred between the backup and the incident using the audit log as a source of truth
6. Scale API back up and monitor

---

## Related Runbooks

- [Backup Procedures](./05-backup.md)
- [Rollback Procedures](./02-rollback.md)
- [Scaling Procedures](./04-scaling.md)
- [Incident Response](./03-incident-response.md)
