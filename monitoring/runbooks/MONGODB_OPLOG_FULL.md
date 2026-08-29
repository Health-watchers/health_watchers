# MongoDB Oplog Nearly Full Runbook

## Alert
`MongoDBOplogNearFull` — Oplog usage exceeds 80 %

## Severity
⚠️ Warning

## Description
The replica set oplog on the primary is approaching capacity. If it fills completely, secondaries that have fallen behind cannot re-sync without a full initial sync, causing extended downtime.

## Immediate Actions (< 5 minutes)

### 1. Confirm oplog usage
```bash
mongosh 'mongodb://root:${MONGO_ROOT_PASSWORD}@mongodb-primary:27017/admin'

> use local
> db.oplog.rs.stats().maxSize        // configured max bytes
> db.oplog.rs.stats().size           // current bytes used
> db.oplog.rs.stats().usedSize       // alias in newer MongoDB
```

### 2. Check replication lag
```bash
> rs.status().members.forEach(m =>
    print(m.name, 'lag:', new Date() - new Date(m.optimeDate), 'ms')
  )
```

A secondary far behind the primary is the most common reason the oplog cannot recycle.

### 3. Identify slow secondaries
Any secondary with lag > 10 s should be investigated first (see `MONGODB_REPLICATION_LAG.md`).

## Root Causes and Fixes

### A. Write throughput spike
Heavy bulk inserts or migrations fill the oplog faster than secondaries can replay.

**Fix:**
- Throttle the batch job or migration
- Increase oplog size (see below)

### B. Slow or down secondary holding oplog
MongoDB cannot truncate oplog entries still needed by lagging secondaries.

**Fix:**
1. Determine which secondary is lagging most:
   ```bash
   > rs.status().members.map(m => ({name: m.name, lag: new Date() - new Date(m.optimeDate)}))
   ```
2. Investigate that secondary (disk I/O, CPU, network)
3. If it cannot catch up, remove it temporarily:
   ```bash
   > rs.remove("mongodb-secondary-2:27017")
   ```
   Re-add after resolving the underlying problem.

### C. Oplog size too small for workload
If this alert fires regularly, the oplog should be resized.

**Resize oplog (MongoDB 4.4+):**
```bash
# Connect to primary
mongosh 'mongodb://root:${MONGO_ROOT_PASSWORD}@mongodb-primary:27017/admin'

> db.adminCommand({ replSetResizeOplog: 1, size: 2048 })  // 2 GB in MB
```

For Docker, set `--oplogSize 2048` in the mongod command in `docker-compose.mongodb-replica.yml`.

## Monitoring Recovery

```bash
# Watch oplog usage drop after throttling writes or removing lagging secondary
watch -n 5 'mongosh mongodb-primary:27017/admin -u root -p "${MONGO_ROOT_PASSWORD}" \
  --eval "use local; printjson(db.oplog.rs.stats().usedSize)"'
```

## Escalation

| Oplog usage | Action |
|---|---|
| 80 – 89 % | Investigate, throttle writes, page DevOps |
| 90 – 95 % | Remove lagging secondary, page DBA |
| > 95 % | Emergency oplog resize, all hands |

## Prevention

- Set oplog to at least 24 h of peak write volume (use `rs.printReplicationInfo()` to get current window)
- Alert on replication lag before it causes oplog pressure
- Run nightly capacity reports in Grafana "MongoDB Replication" dashboard

## Related Alerts
- `MongoDBReplicationLag`
- `MongoDBSecondaryFalling`
- `MongoDBPrimaryDown`

## Related Runbooks
- `MONGODB_REPLICATION_LAG.md`
- `MONGODB_PRIMARY_DOWN.md`
