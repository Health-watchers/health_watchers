# MongoDB Replica Set Setup and Management

## Overview

This guide covers setting up and operating a MongoDB replica set for Health Watchers with high availability and automatic failover.

## Architecture

### Components

- **Primary (1)**: Handles all writes and reads
- **Secondaries (2)**: Read-only copies, eligible for primary election
- **Arbiter (1)**: Votes in elections, doesn't store data (optional but recommended)
- **MongoDB Exporter**: Exports metrics for Prometheus monitoring

### Topology

```
┌─────────────────────────────────────────────┐
│         MongoDB Replica Set (rs0)           │
├─────────────────────────────────────────────┤
│  Primary          Secondary      Secondary  │
│  :27017          :27017         :27017      │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │    Oplog Replication (bidirectional) │   │
│  └──────────────────────────────────────┘   │
│                                              │
│            Arbiter (votes only)             │
│            :27020                           │
└─────────────────────────────────────────────┘

Connection String:
mongodb://user:pass@primary:27017,secondary1:27017,secondary2:27017/dbname?replicaSet=rs0
```

## Setup

### Docker Compose Setup

```bash
# Start replica set
docker-compose -f docker-compose.mongodb-replica.yml up -d

# Initialize replica set (one-time only!)
docker exec health-watchers-mongodb-primary mongosh < k8s/mongodb-replica-set-init.js

# Verify
docker exec health-watchers-mongodb-primary mongosh -u root -p changeme admin --eval "rs.status()"
```

### Kubernetes Setup

```bash
# Create MongoDB storage class (adjust for your cluster)
kubectl apply -f k8s/storage-class.yaml

# Deploy MongoDB StatefulSet
kubectl apply -f k8s/mongodb-replica-set-statefulset.yaml

# Wait for pods
kubectl get pods -n health-watchers -l app.kubernetes.io/name=mongodb -w

# Initialize replica set
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=mongodb -n health-watchers --timeout=300s
kubectl apply -f k8s/mongodb-replica-set-init-job.yaml

# Verify
kubectl exec -it mongodb-0 -n health-watchers -- mongosh -u root -p changeme admin --eval "rs.status()"
```

## Operation

### Connecting to Replica Set

**Via Primary (single writes):**
```bash
mongosh 'mongodb://root:password@mongodb-primary:27017/health_watchers?authSource=admin'
```

**Via Replica Set (automatic failover):**
```bash
mongosh 'mongodb://root:password@mongodb-primary:27017,mongodb-secondary-1:27017,mongodb-secondary-2:27017/health_watchers?replicaSet=rs0&authSource=admin'
```

**Read from Secondary:**
```bash
mongosh 'mongodb://root:password@mongodb-primary:27017,mongodb-secondary-1:27017,mongodb-secondary-2:27017/health_watchers?replicaSet=rs0&readPreference=secondary&authSource=admin'
```

### Monitoring Replication

```bash
# Connect to primary
mongosh -u root -p changeme admin

# Check replica set status
> rs.status()

# Detailed member status
> rs.status().members.map(m => ({
    name: m.name,
    state: ["STARTUP", "PRIMARY", "SECONDARY", "RECOVERING", "FATAL", "STARTUP2", "UNKNOWN", "ARBITER"][m.state],
    health: m.health,
    lastHeartbeat: m.lastHeartbeat,
    lastHeartbeatRecv: m.lastHeartbeatRecv,
    ping: m.lastHeartbeatMessage
  }))

# Check replication lag
> rs.status().members.map(m => ({
    name: m.name,
    lag: new Date() - new Date(m.optimeDate),
    optime: m.optime.ts
  }))

# View oplog
> use local
> db.oplog.rs.find().limit(5).pretty()
```

### Maintenance Tasks

#### Add a New Secondary

```bash
# 1. Start new MongoDB instance
# 2. Connect to primary
mongosh -u root -p changeme admin

# 3. Add member
> rs.add({host: "mongodb-new:27017", priority: 5})

# 4. Monitor sync progress
> rs.status()

# 5. Once synced, can be used for reads
```

#### Remove a Secondary

```bash
# Connect to primary
mongosh -u root -p changeme admin

# Remove member
> rs.remove("mongodb-secondary-2:27017")

# Verify
> rs.status()
```

#### Step Down Primary

```bash
# For maintenance, step down current primary
> rs.stepDown(60)  # Wait 60 seconds before re-election

# New primary will be elected
# Monitor: rs.status()
```

#### Rebuild Oplog

```bash
# Only if oplog is corrupted (rare!)
# WARNING: Requires replica set restart

# Connect to primary with --oplogSizeMB flag
mongod --replSet rs0 --oplogSizeMB=5000
```

## Failover Testing

### Manual Failover Test

```bash
# 1. Connect to primary
mongosh -u root -p changeme admin

# 2. Step down primary
> rs.stepDown()

# 3. Observe failover
> rs.status()  # Will show new primary election

# 4. Verify secondaries accept writes through new primary
> use health_watchers
> db.test.insertOne({timestamp: new Date()})

# 5. Clean up test data
> db.test.deleteMany({})
```

### Network Partition Test

```bash
# Simulate network failure (Docker)
docker network disconnect health-watchers-db health-watchers-mongodb-primary

# Monitor replica set
docker exec health-watchers-mongodb-secondary-1 mongosh -u root -p changeme admin --eval "rs.status()"

# Restore connection
docker network connect health-watchers-db health-watchers-mongodb-primary

# Verify recovery
docker exec health-watchers-mongodb-primary mongosh -u root -p changeme admin --eval "rs.status()"
```

## Backup and Recovery

### Automated Backups

```bash
# Configure mongod for backup
# In mongod.conf or startup params

# Use mongodump for regular backups
mongodump --uri "mongodb://root:password@mongodb-primary:27017" \
          --out /backup/$(date +%Y%m%d)

# For point-in-time recovery, oplog is essential
# Backup oplog separately
mongodump --uri "mongodb://root:password@mongodb-primary:27017" \
          --db local \
          --collection oplog.rs \
          --out /backup/oplog
```

### Restore from Backup

```bash
# Restore data
mongorestore --uri "mongodb://root:password@mongodb-primary:27017" \
             /backup/20240101/

# For point-in-time recovery
# Use mongorestore with oplog replay
mongorestore --oplogReplay \
             --oplogFile /backup/oplog/local/oplog.rs.bson \
             /backup/
```

## Monitoring

### Key Metrics

1. **Replication Lag**
   - Alert if > 30 seconds
   - Check secondary disk I/O and CPU

2. **Oplog Usage**
   - Alert if > 80% full
   - Ensure oplog size fits workload

3. **Member Health**
   - Alert on any unhealthy members
   - Track state changes

4. **Election Frequency**
   - Track elections over time
   - Frequent elections indicate instability

### Grafana Dashboard

Use built-in "MongoDB Replication" dashboard:
- Replica set status
- Replication lag trends
- Oplog growth rate
- Member availability

### Prometheus Alerts

Alerts configured in `monitoring/alerts-database-replication.yml`:
- Primary down
- Replication lag
- Oplog full
- Secondary falling behind
- Storage errors

## Troubleshooting

### Secondary Won't Sync

```bash
# Connect to secondary
mongosh -u root -p changeme admin

# Check sync source
> rs.status().members[1].syncSourceHost

# If "No suitable sync source found":
> rs.syncFrom("primary:27017")  # Force sync from primary

# Check logs
> db.adminCommand({getLog: "replication"})
```

### High Replication Lag

See `MONGODB_REPLICATION_LAG.md` runbook.

### Oplog Too Small

```bash
# Check oplog size
> use local
> db.oplog.rs.stats()

# Increase oplog
# Stop replica set, delete local database, restart with larger oplog
# Use --oplogSizeMB flag
```

### Member Can't Connect to Primary

```bash
# Verify network connectivity
ping mongodb-primary

# Check DNS resolution
nslookup mongodb-primary

# Verify firewall rules
telnet mongodb-primary 27017

# Check MongoDB logs
docker logs mongodb-primary
```

## Performance Tuning

### Write Concern

```javascript
// Ensure writes replicated to majority
db.collection.insertOne(
  {doc},
  {writeConcern: {w: "majority", j: true, wtimeout: 5000}}
)

// Options:
// w: 1           - Primary only (default, no durability)
// w: 2           - Primary + 1 secondary (some HA)
// w: "majority"  - Primary + majority of secondaries (best for HA)
// j: true        - Journaled (durable)
// wtimeout: ms   - Timeout for write concern
```

### Read Preference

```javascript
// Read from secondaries to reduce primary load
db.collection.find({}).readPreference("secondary")

// Options:
// "primary" (default)
// "primaryPreferred"
// "secondary"
// "secondaryPreferred"
// "nearest"  (for geo-distributed)
```

### Index Management

```bash
# Build indexes on secondary
# 1. Stop secondary
# 2. Start in standalone mode
mongod --dbpath /data/db

# 3. Build index
mongosh health_watchers
> db.collection.createIndex({field: 1})

# 4. Restart as replica set member
```

## Security

### Enable Authentication

Already configured in setup with:
- `--auth` flag
- Root user with strong password
- Per-application users with minimal privileges

### Restrict Access

```yaml
# Kubernetes NetworkPolicy
# See mongodb-replica-set-statefulset.yaml
```

### Audit Logging

```bash
# Enable audit logging
mongod --auditDestination file \
       --auditFormat BSON \
       --auditPath /var/log/mongodb/audit.log \
       --auditFilter '{atype:{$in:["authenticate","authorize"]}}'
```

## Support & Escalation

For issues:
1. Check `monitoring/runbooks/` for specific scenarios
2. Review MongoDB logs
3. Contact DevOps team
4. Page on-call for critical issues

Critical Contacts:
- **DevOps**: devops@health-watchers.io
- **Database Team**: database@health-watchers.io
- **On-Call**: See PagerDuty escalation
