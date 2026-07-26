# MongoDB Primary Down Runbook

## Alert
MongoDBPrimaryDown: The MongoDB replica set primary is unavailable

## Severity
🚨 Critical

## Description
The primary MongoDB instance is not responding. The replica set may automatically elect a new primary, but transactions and writes are affected during this time.

## Immediate Actions (1-2 minutes)

1. **Verify the Alert**
   ```bash
   # Check replica set status
   mongosh mongodb-primary:27017 -u admin -p password --authenticationDatabase admin
   > rs.status()
   ```

2. **Check Primary Logs**
   ```bash
   docker logs health-watchers-mongodb-primary --tail=100
   # OR on Kubernetes
   kubectl logs -n health-watchers mongodb-0 -c mongodb
   ```

3. **Page On-Call**
   - Trigger PagerDuty for database team
   - Notify in #database-alerts channel

## Investigation (2-5 minutes)

### Check Container Status
```bash
# Docker
docker inspect health-watchers-mongodb-primary
docker ps | grep mongodb-primary

# Kubernetes
kubectl get pod -n health-watchers mongodb-0
kubectl describe pod -n health-watchers mongodb-0
```

### Check Resource Constraints
```bash
# Docker
docker stats health-watchers-mongodb-primary

# Kubernetes
kubectl top pod -n health-watchers mongodb-0
```

### Common Causes
- Out of Memory (OOM)
- Disk full
- CPU throttling
- Network connectivity issues
- Process crash

## Recovery Steps

### If Container Crashed

**Docker:**
```bash
# Check exit code
docker inspect --format='{{.State.ExitCode}}' health-watchers-mongodb-primary

# Restart container
docker restart health-watchers-mongodb-primary

# Verify it came back up
docker logs health-watchers-mongodb-primary --tail=50
```

**Kubernetes:**
```bash
# Delete the pod - StatefulSet will recreate it
kubectl delete pod -n health-watchers mongodb-0

# Wait for it to restart
kubectl get pod -n health-watchers mongodb-0 -w
```

### If Disk is Full

```bash
# Check disk usage
df -h /data/db

# If possible, clean up:
# - Temporary files in /data/db/_tmp
# - Unused indices (requires planning with team)
# - Old oplog entries (automatic if configured)

# Extend volume if needed
# This requires infrastructure/cloud team involvement
```

### If Running Out of Memory

```bash
# Check current limits
docker inspect --format='{{.HostConfig.Memory}}' health-watchers-mongodb-primary

# Increase memory allocation and restart
# Edit docker-compose.yml or Kubernetes deployment
# Set memory.limit higher

# Restart container
docker restart health-watchers-mongodb-primary
```

## Failover Process

If primary cannot be recovered quickly:

1. **Wait for automatic failover** (30-60 seconds)
   - Replica set will elect a secondary as new primary
   - Monitor rs.status() for election progress

2. **Force election if needed** (only if necessary)
   ```bash
   # Connect to secondary
   mongosh mongodb-secondary-1:27017 -u admin -p password --authenticationDatabase admin
   > rs.stepDown()  # Current primary steps down
   > # Wait for election
   > rs.status()    # Verify new primary
   ```

3. **Verify replication**
   ```bash
   > rs.status()
   > # Check that secondaries are replicating
   > # Look for "syncSourceHost" and absence of replication lag
   ```

## Post-Recovery

1. **Test Failover Once Primary Recovers**
   ```bash
   # If the original primary comes back, verify it joins as secondary
   mongosh mongodb-primary:27017
   > rs.status()
   ```

2. **Check Data Consistency**
   ```bash
   # On primary
   > db.collection.find().limit(10)
   
   # On secondaries - should see same data
   > db.getMongo().setReadPref("secondary")
   > db.collection.find().limit(10)
   ```

3. **Review Logs**
   - Check why primary went down
   - Look for patterns
   - Document findings

## Escalation

- **5 minutes**: Page database team lead
- **10 minutes**: Page VP Engineering
- **15 minutes**: Page CTO

## Prevention

1. **Monitoring**
   - Set up alerts for disk space, memory, CPU
   - Monitor process health

2. **Capacity Planning**
   - Ensure sufficient storage (3x working set minimum)
   - Set memory appropriately (half of system RAM, max 64GB)
   - Monitor growth trends

3. **Testing**
   - Regular failover drills
   - Test backup and restore procedures
   - Practice failover in staging

## Related Alerts
- MongoDBReplicaSetMemberDown
- MongoDBReplicationLag
- MongoDBConnectionPoolExhausted
