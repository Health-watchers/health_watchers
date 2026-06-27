# MongoDB Replication Lag Runbook

## Alert
MongoDBReplicationLag: Secondary is lagging behind primary

## Severity
⚠️ Warning (can escalate to Critical if not addressed)

## Description
A secondary node is falling behind the primary in applying oplog entries. If lag continues to increase, secondary may become unavailable and trigger a failover.

## Investigation (2-5 minutes)

### Check Replication Status
```bash
mongosh mongodb-primary:27017 -u admin -p password --authenticationDatabase admin
> rs.status()

# Look for:
# - "optimeDate" - when each member last applied an oplog entry
# - "syncSourceHost" - who each secondary is syncing from
# - "lag" - replication lag in seconds
```

### Identify the Lagging Secondary
```bash
> db.adminCommand("replSetGetStatus").members
```

### Check Primary Oplog Rate
```bash
# Check how fast oplog is growing
> db.oplog.rs.aggregate([{$group:{_id:null,count:{$sum:1}}}])

# Check oplog size
> db.adminCommand("collStats", "oplog.rs")
```

### Check Secondary Performance
```bash
# SSH to lagging secondary
ssh user@mongodb-secondary-1

# Check disk I/O
iostat -x 1 10

# Check CPU and memory
top -b -n 1 | head -20

# Check MongoDB logs
tail -50 /data/db/mongod.log
```

## Root Causes

### 1. Secondary Too Slow
- Insufficient CPU allocation
- Slow disk I/O
- Heavy index builds in progress
- Hardware issue

**Fix:**
```bash
# Increase resources
# Edit deployment and increase CPU/memory limits
# Restart secondary

# Check if index build is running
> db.adminCommand("currentOp", {query:true})
```

### 2. Primary Writing Too Fast
- Sudden spike in write traffic
- Large bulk inserts
- Hot shard (if sharded)

**Fix:**
- Distribute writes across multiple collections
- Optimize application queries
- Add more secondaries for read scaling

### 3. Network Issues
- High latency between primary and secondary
- Packet loss
- Network congestion

**Fix:**
```bash
# Test network connectivity
ping -c 10 mongodb-secondary-1
mtr -c 100 mongodb-secondary-1

# Check network stats
netstat -s
```

### 4. Disk Full on Secondary
- Secondary oplog can't write to disk
- Application can't write to collections

**Fix:**
```bash
# Check disk usage on secondary
ssh user@mongodb-secondary-1
df -h /data/db

# Clean up if needed
# Remove temporary files
rm -rf /data/db/_tmp/*

# Increase volume size if needed
```

## Resolution Steps

### Step 1: Assess Severity
```bash
# Get current lag
mongosh mongodb-primary:27017 -u admin -p password --authenticationDatabase admin
> rs.status().members.map(m => ({
    host: m.name,
    lag: new Date() - new Date(m.optimeDate)
  }))

# If lag > 60 seconds, escalate to critical
```

### Step 2: Reduce Write Load (if needed)
```bash
# Notify application team if write load is high
# Consider:
# - Throttling application writes
# - Deferring non-critical writes
# - Using write concern "w:1" temporarily (risky!)
```

### Step 3: Monitor Recovery
```bash
# Watch replication lag decrease
watch -n 2 'mongosh mongodb-primary:27017 -u admin -p password --authenticationDatabase admin --eval "rs.status().members.map(m => ({host: m.name, lag: new Date() - new Date(m.optimeDate)}))"'

# Alt: Set up continuous monitoring
# In separate terminal, run every 5 seconds
for i in {1..60}; do
  mongosh mongodb-primary:27017 -u admin -p password --authenticationDatabase admin \
    --eval "rs.status().members.map(m => ({host: m.name, lag: new Date() - new Date(m.optimeDate)}))"
  sleep 5
done
```

### Step 4: Investigate Root Cause
```bash
# Once lag recovered, analyze:

# 1. Check primary write rate during lag
# In Grafana: mongodb_replset_member_replication_lag_seconds

# 2. Check secondary disk I/O
# In Grafana: node_disk_writes_completed_total

# 3. Check secondary CPU
# In Grafana: process_cpu_seconds_total
```

## Prevention

### 1. Capacity Planning
- Ensure secondaries have equal/better hardware than primary
- Monitor working set and ensure it fits in RAM
- Plan storage for 7-14 days of oplog

### 2. Network Optimization
- Place replica set members in same datacenter (low latency)
- Use dedicated network for replication if possible
- Monitor network metrics

### 3. Write Optimization
- Batch writes when possible
- Use multi-document transactions appropriately
- Monitor write rate trends

### 4. Index Management
- Build indexes offline on secondaries
- Avoid index creation during peak load
- Monitor oplog growth after index builds

## Escalation

- **If lag > 60s**: Alert DevOps
- **If lag > 300s**: Page on-call engineer
- **If lag > 600s**: Page database architect

## Post-Incident

1. Document what caused the lag
2. Implement preventive measures
3. Update capacity planning
4. Review and adjust alerting thresholds
5. Update runbooks based on learnings

## Related Alerts
- MongoDBPrimaryDown
- MongoDBSecondaryFalling
- MongoDBOplogNearFull
