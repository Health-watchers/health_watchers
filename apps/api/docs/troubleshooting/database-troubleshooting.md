# Database Troubleshooting

Covers MongoDB connection issues, replication, sharding, query performance, index management, and data integrity.

---

## Table of Contents

- [Connection Failures](#connection-failures)
- [Connection Pool Issues](#connection-pool-issues)
- [Query Performance](#query-performance)
- [Index Management](#index-management)
- [Replication Issues](#replication-issues)
- [Sharding Issues](#sharding-issues)
- [Data Integrity Issues](#data-integrity-issues)
- [Backup and Restore](#backup-and-restore)
- [MongoDB Atlas Specific Issues](#mongodb-atlas-specific-issues)
- [Monitoring Reference](#monitoring-reference)

---

## Connection Failures

### Server won't connect to MongoDB on startup

The API retries the connection 5 times with exponential backoff (1 s → 2 s → 4 s → 8 s → 16 s) before exiting.

**Diagnose:**
```bash
# Test the URI directly
mongosh "$MONGO_URI" --eval "db.adminCommand({ ping: 1 })"

# Check DNS resolution
nslookup <hostname from MONGO_URI>

# Check port reachability
telnet <host> 27017
```

**Common causes:**

| Symptom in logs | Cause | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB not running or wrong host | Start MongoDB; in Docker use service name not `localhost` |
| `Authentication failed` | Wrong username/password in URI | Rotate and update `MONGO_URI` credentials |
| `ENOTFOUND <hostname>` | DNS resolution failed | Check hostname spelling; VPN/private DNS needed? |
| `SSL routines::no protocols available` | TLS version mismatch | Add `?tls=true&tlsCAFile=...` to URI or upgrade MongoDB driver |
| `serverSelectionTimeoutMS expired` | Firewall blocking port 27017 | Open port in security group / firewall rules |

### MongoDB reconnects repeatedly

**Symptom:** Log shows alternating `db:disconnected` / `db:reconnected` events every few minutes.

**Cause:** Intermittent network issues, idle connection timeout on a firewall/NAT, or MongoDB Atlas M0/M2/M5 tier limitations.

**Fix:**
1. Set `heartbeatFrequencyMS` lower to detect and recover faster:
   ```bash
   MONGODB_HEARTBEAT_FREQUENCY_MS=5000
   ```
2. On Atlas, upgrade from a shared tier (M0/M2/M5) which has strict connection limits.
3. Check if a firewall is killing idle TCP connections — set `MONGODB_SOCKET_TIMEOUT_MS` below the firewall idle timeout.

### `MongoNetworkError` during a request

**Symptom:** Individual requests fail with a network error even though the server is "connected".

**Cause:** Connection dropped between health check intervals (10 s). Mongoose reconnects automatically but the in-flight request fails.

**Fix:** Implement retry logic at the service layer for idempotent operations. The connection pool recovers automatically within `heartbeatFrequencyMS`.

---

## Connection Pool Issues

### Pool exhaustion — `waitQueueTimeoutMS expired`

```
MongoServerError: Timed out waiting for connection from connection pool.
```

**Diagnose:**
```bash
# Check current pool state
curl -s http://localhost:4000/metrics | grep mongodb_connection_pool

# Check for critical utilization events in logs
jq 'select(.event == "db:pool:critical_utilization")' /var/log/api/app.log
```

**Fix:**
```bash
# Increase pool size (check DB server's maxIncomingConnections first)
MONGODB_POOL_SIZE=20
MONGODB_MIN_POOL_SIZE=5

# Increase wait timeout if bursty traffic is acceptable
MONGODB_WAIT_QUEUE_TIMEOUT_MS=10000
```

**Root cause checklist:**
- [ ] Slow queries holding connections longer than expected — add indexes
- [ ] Missing `await` in async handler — connection not returned to pool
- [ ] Too many replicas connecting to one MongoDB instance — add replica or use Atlas proxy
- [ ] Background jobs consuming connections during peak hours — reschedule to off-peak

### Pool size too large causing MongoDB to reject connections

**Symptom:** `MongoServerError: Too many simultaneous connections`

**Cause:** Sum of all API pod pool sizes exceeds MongoDB's `maxIncomingConnections`.

**Fix:**
```
Per-pod pool size = MongoDB maxIncomingConnections / number of pods
# Default MongoDB maxIncomingConnections: 1000000 (effectively unlimited on Atlas)
# On Atlas M10: ~1500 connections total
```

If running 10 pods with `MONGODB_POOL_SIZE=20`, that's 200 total connections. Ensure this is within your Atlas tier's limit.

---

## Query Performance

### Finding slow queries

```bash
# Enable profiling for queries > 100 ms
mongosh "$MONGO_URI" --eval "db.setProfilingLevel(1, { slowms: 100 })"

# View the 10 slowest recent queries
mongosh "$MONGO_URI" --eval "
  db.system.profile
    .find({ millis: { \$gt: 100 } })
    .sort({ ts: -1 })
    .limit(10)
    .forEach(p => printjson({
      ns: p.ns,
      op: p.op,
      millis: p.millis,
      planSummary: p.planSummary,
      keysExamined: p.keysExamined,
      docsExamined: p.docsExamined,
      nreturned: p.nreturned
    }))
"
```

### Analyzing a specific query

```javascript
// Run in mongosh
db.patients.find(
  { clinicId: ObjectId("..."), isActive: true }
).explain("executionStats")

// Key fields to check:
// executionStats.totalDocsExamined   — how many docs were scanned
// executionStats.nReturned           — how many were returned
// executionStats.executionTimeMillis — total time
// winningPlan.stage                  — "IXSCAN" good, "COLLSCAN" bad
// winningPlan.indexName              — which index was used
```

A healthy query has `totalDocsExamined ≈ nReturned`. If `totalDocsExamined` is 10× `nReturned` or more, the index is inefficient or missing.

### Common query anti-patterns

**Unindexed sort:**
```javascript
// Bad — sort on unindexed field forces in-memory sort
db.payments.find({ clinicId: ... }).sort({ amount: -1 })

// Fix — add the sort field to the index
db.payments.createIndex({ clinicId: 1, amount: -1 })
```

**Negation operators:**
```javascript
// Bad — $ne, $nin, $not cannot use indexes efficiently
db.patients.find({ status: { $ne: 'inactive' } })

// Better — query for what you want
db.patients.find({ status: 'active' })
```

**Leading wildcard regex:**
```javascript
// Bad — cannot use index
db.patients.find({ name: /john/i })

// Better — anchored regex can use an index
db.patients.find({ name: /^John/ })

// Best — use text index for full-text search
db.patients.find({ $text: { $search: "john" } })
```

---

## Index Management

### List all indexes on a collection

```javascript
db.patients.getIndexes()
```

### Check index usage stats

```javascript
// Shows how often each index is used
db.patients.aggregate([{ $indexStats: {} }])

// Indexes with 0 accesses since last restart can be candidates for removal
```

### Required indexes for this application

The following indexes are critical for performance. Verify they exist after a fresh setup or migration:

```javascript
// Patients — all queries are clinic-scoped
db.patients.createIndex({ clinicId: 1, isActive: 1 })
db.patients.createIndex({ clinicId: 1, createdAt: -1 })
db.patients.createIndex({ searchName: 1 })
db.patients.createIndex({ "$**": "text" }, { name: "patient_text_search" })

// Appointments
db.appointments.createIndex({ clinicId: 1, scheduledAt: -1 })
db.appointments.createIndex({ patientId: 1, scheduledAt: -1 })

// Encounters
db.encounters.createIndex({ clinicId: 1, createdAt: -1 })
db.encounters.createIndex({ patientId: 1, createdAt: -1 })

// Payments
db.paymentrecords.createIndex({ clinicId: 1, createdAt: -1 })
db.paymentrecords.createIndex({ intentId: 1 }, { unique: true })

// Audit logs — TTL index for automatic expiry
db.auditlogs.createIndex({ createdAt: 1 }, { expireAfterSeconds: 189216000 }) // 6 years

// Refresh tokens — TTL for automatic cleanup
db.refreshtokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

Run `npm run migrate:status` to confirm all migration-managed indexes are applied.

### Duplicate index error during migration

```
MongoServerError: Index already exists with a different name
```

**Fix:**
```javascript
// Find conflicting indexes
db.collection.getIndexes()

// Drop the old index by name
db.collection.dropIndex("old_index_name")

// Re-run the migration
```

### Index build blocking writes (MongoDB < 4.2)

On MongoDB 4.2+, `createIndex()` uses a non-blocking algorithm by default. On older versions, the build blocks reads and writes.

**Fix for large collections:** Use a rolling index build — add the index to secondaries first, step down the primary, build on the new secondary.

---

## Replication Issues

### Replica set member shows `SECONDARY` but is not replicating

```javascript
// Check replica set status
rs.status()

// Look for: stateStr: "SECONDARY", health: 1, optimeDate lagging behind primary
```

**Common causes:**
- Network partition between members
- Disk full on secondary
- Secondary too far behind — `rs.syncFrom()` may be needed

### Read preference causing stale reads

The API uses the default `primary` read preference, which always reads from the primary. If reads are being routed to a secondary (via connection string options), stale data may be returned.

**Diagnosis:**
```javascript
db.adminCommand({ isMaster: 1 })
// ismaster: true — this is the primary
```

**Fix:** Remove `readPreference=secondary` or `readPreference=secondaryPreferred` from `MONGO_URI` unless read staleness is acceptable.

---

## Sharding Issues

The project has sharding infrastructure migrations (`20260727_setup_sharding_infrastructure.ts`, `20260825_sharding_shard_key_indexes.ts`).

### Queries not using the shard key

**Symptom:** Queries are scatter-gather (hitting all shards) instead of targeting a single shard.

**Diagnosis:**
```javascript
db.patients.find({ patientId: "..." }).explain("executionStats")
// Look for: shards section — if multiple shards are queried, shard key is not in filter
```

**Fix:** Always include the shard key in queries. For the patients collection, this is typically `clinicId`.

### Chunk imbalance — one shard has most data

```javascript
sh.status()
// Shows chunk distribution per shard
```

**Fix:** Run the balancer: `sh.startBalancer()`. Ensure the shard key has high cardinality — low cardinality shard keys (e.g., a boolean) cause permanent imbalance.

### Migration fails on sharded collection

**Symptom:** `createIndex` in a migration fails on a sharded collection.

**Fix:** On sharded collections, indexes must be created on all shards. Use `db.runCommand({ createIndexes: ... })` on the `admin` db, or create the index on each shard directly via `mongosh`.

---

## Data Integrity Issues

### Soft-deleted records appearing in results

The app uses `isActive: false` for soft deletes on patients and users. Queries that don't filter by `isActive` will return deleted records.

**Fix:** Always include `{ isActive: true }` in patient/user queries. Use the `requireClinicMatch()` middleware which sets `res.locals.filter` with the clinic scope — but does not add `isActive` automatically.

### Orphaned records after a delete

If a patient is deleted but encounters/appointments are not cascade-deleted:

**Find orphans:**
```javascript
// Encounters without a matching patient
db.encounters.aggregate([
  {
    $lookup: {
      from: "patients",
      localField: "patientId",
      foreignField: "_id",
      as: "patient"
    }
  },
  { $match: { patient: { $size: 0 } } }
])
```

**Fix:** The archive module (`modules/archive`) handles archival. Run the archive job for the deleted patient's records.

### PHI field decryption failure

**Symptom:** Encrypted fields return garbled data or throw an error.

**Cause:** `FIELD_ENCRYPTION_KEY` has changed since the data was encrypted.

**Fix:**
1. Restore the old key.
2. Run `apps/api/scripts/rotate-encryption-key.ts` to re-encrypt all PHI fields with the new key.
3. Never rotate `FIELD_ENCRYPTION_KEY` without running the migration script first.

---

## Backup and Restore

### Check backup job status

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:4000/health/backup
```

### Manual backup

```bash
# Via mongodump
mongodump \
  --uri="$MONGO_URI" \
  --out=/tmp/backup-$(date +%Y%m%d)

# Encrypt before upload
openssl enc -aes-256-cbc -pbkdf2 \
  -k "$BACKUP_ENCRYPTION_KEY" \
  -in /tmp/backup.tar.gz \
  -out /tmp/backup.tar.gz.enc
```

### Restore from backup

```bash
# Decrypt
openssl enc -d -aes-256-cbc -pbkdf2 \
  -k "$BACKUP_ENCRYPTION_KEY" \
  -in backup.tar.gz.enc \
  -out backup.tar.gz

# Restore
mongorestore \
  --uri="$MONGO_URI" \
  --dir=/tmp/backup-20260825
```

### Backup verification workflow

The `backup-verify.yml` GitHub Actions workflow runs automated backup verification. If it fails:
1. Check that the backup bucket (`BACKUP_BUCKET`) is accessible.
2. Verify `BACKUP_ENCRYPTION_KEY` matches the key used when the backup was created.
3. Check the S3 bucket for the latest backup object — it should be < `BACKUP_RETENTION_DAYS` old.

---

## MongoDB Atlas Specific Issues

### `MongoServerError: user is not allowed to do action on database`

**Cause:** The Atlas database user lacks the required role.

**Fix:** In Atlas UI → Database Access → Edit user → Add role: `readWrite` on the health_watchers database (minimum). For migrations: `dbAdmin` role is also needed.

### Atlas IP allowlist blocking connection

**Symptom:** `MongoServerSelectionError: connect ECONNREFUSED` only in production (not local).

**Fix:** In Atlas UI → Network Access → Add IP Address. For production, use a static egress IP or NAT gateway. Avoid `0.0.0.0/0` in production.

### Atlas M0 connection limit exceeded

**Symptom:** Connections fail intermittently with "Too many connections".

**Atlas tier connection limits:**
| Tier | Max Connections |
|---|---|
| M0 (free) | 500 |
| M2 | 500 |
| M5 | 500 |
| M10 | 1500 |
| M20 | 3000 |

**Fix:** Upgrade to M10+ for production use, or reduce `MONGODB_POOL_SIZE`.

---

## Monitoring Reference

### Key metrics to watch

```bash
# From Prometheus endpoint
curl -s http://localhost:4000/metrics | grep -E \
  'mongodb_connection_pool_size|mongodb_pool_wait_queue'
```

| Metric | Alert threshold |
|---|---|
| Pool utilization | > 80% warn, > 95% critical |
| Wait queue size | > 0 for more than 30s |
| DB state | Not `connected` |

### Log events to alert on

| Event key | Meaning |
|---|---|
| `db:disconnected` | MongoDB dropped — reconnect in progress |
| `db:pool:critical_utilization` | Pool > 95% — imminent exhaustion |
| `db:pool:wait_queue` | Requests waiting for connections |

### Useful mongosh one-liners

```javascript
// Current operations (find long-running queries)
db.currentOp({ "active": true, "secs_running": { $gt: 5 } })

// Kill a long-running query
db.killOp(<opid>)

// Collection sizes
db.stats()
db.patients.stats()

// Index sizes
db.patients.stats().indexSizes

// Replica set lag
rs.printSecondaryReplicationInfo()
```
