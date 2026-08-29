# MongoDB Secondary Falling Behind Runbook

## Alert
`MongoDBSecondaryFalling` — A secondary's replication lag is increasing at > 0.1 s/s over 5 minutes

## Severity
⚠️ Warning (escalates to 🚨 Critical if lag > 300 s)

## Description
One or more secondaries are unable to keep pace with the primary's oplog. If unchecked, the secondary will be ejected from the replica set and require a full initial sync.

## Immediate Actions (< 5 minutes)

### 1. Identify which secondary is falling behind
```bash
mongosh 'mongodb://root:${MONGO_ROOT_PASSWORD}@mongodb-primary:27017/admin'

> rs.status().members.forEach(m => {
    const lag = (new Date() - new Date(m.optimeDate)) / 1000;
    if (lag > 5) print('LAGGING:', m.name, lag + 's behind');
  })
```

### 2. Connect to the lagging secondary and check its state
```bash
mongosh 'mongodb://root:${MONGO_ROOT_PASSWORD}@mongodb-secondary-1:27017/admin'

> rs.status()
> db.adminCommand({ serverStatus: 1 }).repl.buffer
```

### 3. Check if an index build is causing slowness
```bash
> db.adminCommand({ currentOp: 1, $all: true }).inprog
  .filter(op => op.command && op.command.createIndexes)
  .map(op => ({ ns: op.ns, progress: op.progress }))
```

## Root Causes and Fixes

### A. Index build on secondary
Ongoing index creation consumes I/O and CPU, slowing oplog replay.

**Fix:** Wait for index build to complete. If urgent, restart secondary after the build finishes.

### B. High write load on primary
Batch jobs, migrations, or traffic spikes flood the oplog.

**Fix:**
- Throttle the write source
- Distribute writes across multiple collections

### C. Secondary hardware under-provisioned
Disk IOPS or CPU insufficient to keep up.

**Fix:**
- Upgrade secondary VM/container resources
- Check Docker resource limits in `docker-compose.mongodb-replica.yml`

### D. Network issues between primary and secondary
High latency or packet loss slows oplog transfer.

**Fix:**
```bash
# From the secondary host, measure round-trip to primary
ping -c 20 mongodb-primary
mtr -c 100 --report mongodb-primary
```

### E. Secondary in RECOVERING state
The secondary stepped back into RECOVERING to rebuild state.

**Fix:** Monitor `rs.status()` — it should recover automatically within minutes. If stuck:
```bash
# Force sync from primary
> rs.syncFrom("mongodb-primary:27017")
```

## Recovery Verification

```bash
# Watch lag decrease in real time (run from primary)
while true; do
  mongosh mongodb-primary:27017/admin \
    -u root -p "${MONGO_ROOT_PASSWORD}" --quiet \
    --eval 'rs.status().members.forEach(m => print(m.name, (new Date()-new Date(m.optimeDate))/1000 + "s"))'
  sleep 5
done
```

Alert resolves automatically when lag returns below threshold.

## Escalation

| Lag | Action |
|---|---|
| 30 – 60 s | Investigate — this runbook |
| 60 – 300 s | Page on-call DBA |
| > 300 s | Consider removing secondary; page engineering lead |

## Prevention

- Keep secondary hardware spec ≥ primary spec
- Monitor disk I/O and CPU on secondaries in Grafana
- Schedule index builds during off-peak hours
- Run chaos/failover drills monthly to ensure secondaries stay healthy

## Related Alerts
- `MongoDBReplicationLag`
- `MongoDBOplogNearFull`
- `MongoDBPrimaryDown`

## Related Runbooks
- `MONGODB_REPLICATION_LAG.md`
- `MONGODB_OPLOG_FULL.md`
- `MONGODB_PRIMARY_DOWN.md`
