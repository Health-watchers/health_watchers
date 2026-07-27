# Database Sharding Strategy

## Overview

Health Watchers implements a comprehensive database sharding strategy to distribute data across multiple MongoDB shards, enabling horizontal scaling and improved performance as the platform grows.

## Goals

1. **Horizontal Scalability**: Scale data distribution across multiple servers
2. **Performance**: Reduce query scope and improve response times
3. **High Availability**: Distribute risk and enable regional deployments
4. **Data Locality**: Keep related data on same shard when possible
5. **Operational Simplicity**: Automate shard management and monitoring

## Sharding Architecture

### Overview Diagram

```
┌─────────────────────────────────────────────┐
│         Application Layer                    │
│  (Determines shard via ShardingService)     │
└──────────────┬──────────────────────────────┘
               │
        ┌──────┴──────┐
        │ ShardKey    │
        │ Extraction  │
        └──────┬──────┘
               │
    ┌──────────┼──────────┐
    │          │          │
┌───▼───┐  ┌───▼───┐  ┌───▼───┐
│Shard 1│  │Shard 2│  │Shard 3│  │Shard 4│
│       │  │       │  │       │  │       │
│Clinic │  │Clinic │  │Clinic │  │Clinic │
│A, B   │  │C, D   │  │E, F   │  │G, H   │
└───────┘  └───────┘  └───────┘  └───────┘
    │          │          │          │
    └──────────┼──────────┼──────────┘
               │
        ┌──────▼──────┐
        │  Balancer   │
        │  Monitoring │
        └─────────────┘
```

## Shard Key Selection

### Collections and Shard Keys

| Collection | Shard Key | Type | Rationale |
|-----------|-----------|------|-----------|
| **Encounters** | `clinicId` | Hashed | Group patient encounters by clinic for data locality |
| **Patients** | `clinicId` | Hashed | Keep patient records with clinic for HIPAA compliance |
| **CommunicationLogs** | `createdAt` | Range | Time-based sharding for time-series data |
| **AuditLogs** | `clinicId` | Hashed | Audit trails separated by clinic for compliance |
| **HealthLogs** | `patientId` | Hashed | Patient health data on same shard for performance |

### Shard Key Characteristics

1. **Clinicaffinity** (encounters, patients, audit logs):
   - Keeps all clinic data together
   - Improves HIPAA compliance
   - Enables clinic-level failover
   - Good distribution across clinics

2. **Time-based** (communication logs):
   - Supports time-range queries
   - Enables archive shards
   - Good for time-series workloads

3. **Patient-affinity** (health logs):
   - Keeps patient data together
   - Supports patient data portability
   - Good for longitudinal health records

## Shard Distribution

### Current Configuration

```
4 Shards
├── Shard 1: Clinics A-B (Est. 25% load)
├── Shard 2: Clinics C-D (Est. 25% load)
├── Shard 3: Clinics E-F (Est. 25% load)
└── Shard 4: Clinics G-H (Est. 25% load)
```

### Scaling Plan

| Phase | Timeline | Shards | Expected Capacity |
|-------|----------|--------|-------------------|
| Phase 1 | Now | 4 | 10-50 clinics |
| Phase 2 | Month 6 | 8 | 50-100 clinics |
| Phase 3 | Month 12 | 16 | 100-500 clinics |
| Phase 4 | Month 24 | 32+ | 500+ clinics |

## Hashing Algorithm

### SHA-256 Hashing

For clinic-based sharding, we use SHA-256 hashing:

```typescript
// Example: clinicId "clinic-001" → shard-3
shardKey = "clinic-001"
hash = SHA256("clinic-001") = "a1b2c3d4e5f6..."
shardIndex = parseInt("a1b2c3d4", 16) % 4 = 3
shardId = "shard-" + (3 + 1) = "shard-4"
```

### Benefits

1. **Uniform Distribution**: Hashing provides even distribution
2. **Scalability**: Adding new shards requires rebalancing only some documents
3. **Predictable**: Same key always hashes to same shard
4. **Fast**: O(1) shard determination

## High Availability

### Replication Set Per Shard

Each shard runs as a MongoDB Replica Set:

```
Shard 1
├── Primary Node (writes)
├── Secondary Node 1 (reads + failover)
└── Secondary Node 2 (reads + failover)
```

### Failover Strategy

1. **Primary Failure**: Secondary automatically promoted (30s - 2min)
2. **Shard Failure**: Connection redirected to replica set
3. **Data Loss Prevention**: W=majority writes, Durable commits

## Migration Path

### Phase 1: Initial Setup (Week 1-2)

```bash
# 1. Deploy sharding infrastructure
- Create 4 shard servers
- Configure replica sets
- Set up load balancer

# 2. Create sharding metadata
- Deploy migration scripts
- Initialize shard configuration
- Set up monitoring
```

### Phase 2: Data Migration (Week 3-4)

```bash
# 1. Enable sharding for collections
- Clinic -> Shard via clinicId
- Patient -> Shard via clinicId
- Audit -> Shard via clinicId
- HealthLog -> Shard via patientId

# 2. Migrate existing data
- Gradually move documents
- Monitor shard balance
- Run balancer in background

# 3. Verify data integrity
- Compare document counts
- Check for orphaned documents
- Validate indexes
```

### Phase 3: Validation (Week 5-6)

```bash
# 1. Performance testing
- Benchmark query times
- Test failover scenarios
- Load test with 10x expected traffic

# 2. Compliance check
- Verify HIPAA compliance
- Check audit trail completeness
- Test backup/restore

# 3. Cutover preparation
- Create rollback plan
- Brief operations team
- Schedule cutover window
```

### Phase 4: Production Cutover (Week 7)

```bash
# 1. Read traffic migration
- Route read queries to shards
- Monitor performance
- Keep write traffic on legacy

# 2. Write traffic migration
- Gradually shift writes
- Monitor consistency
- Verify replication lag < 100ms

# 3. Legacy cleanup
- Stop legacy instance
- Archive backup
- Update documentation
```

## Monitoring & Maintenance

### Key Metrics

```
GET /api/admin/shards/metrics

{
  "encounters": {
    "shardCount": 4,
    "totalDocuments": 1000000,
    "avgDocsPerShard": 250000,
    "imbalance": "3.2%",
    "shards": [
      { "shard": "shard-1", "docs": 250100 },
      { "shard": "shard-2", "docs": 249800 },
      { "shard": "shard-3", "docs": 250200 },
      { "shard": "shard-4", "docs": 249900 }
    ]
  }
}
```

### Health Checks

Run periodically:

```bash
# Check shard health
GET /api/admin/shards/health

# Check balance
GET /api/admin/shards/balance

# Check replication lag
GET /api/admin/shards/replication-lag
```

### Rebalancing

Automatic rebalancing runs when:

1. Shard imbalance > 15%
2. Chunk size > 64MB
3. Shard utilization > 80%

Manual trigger:

```bash
POST /api/admin/shards/rebalance
Body: {
  "collection": "encounters",
  "targetBalance": 5 // 5% imbalance
}
```

## Failover Scenarios

### Scenario 1: Single Node Failure

```
Before:
Shard 1 (replica set)
├── Primary (FAILED)
├── Secondary 1 (promotion in progress)
└── Secondary 2

After (Automatic, ~30s):
├── Secondary 1 (now Primary)
├── Secondary 2
└── New node joins (when ready)
```

### Scenario 2: Entire Shard Failure

```
Before: 4 shards
Shard 1 (FAILED)
Shard 2 ✓
Shard 3 ✓
Shard 4 ✓

Action:
1. Restore from backup
2. Resync data
3. Verify consistency
4. Re-enable shard

Recovery Time: ~2-4 hours
Data Loss: None (backups on separate storage)
```

### Scenario 3: Network Partition

The system maintains quorum:
- If primary isolated: secondary becomes primary
- If minority isolated: read-only until rejoined
- Automatic reconciliation when network heals

## Compliance

### HIPAA Compliance

1. **Data Segregation**: Clinic data on dedicated shards
2. **Audit Trail**: All shard operations logged
3. **Encryption**: In-transit and at-rest
4. **Backup**: Daily encrypted backups
5. **Retention**: Follows retention policies

### Data Residency

- All shards in same region (configurable)
- Data never leaves region without explicit export
- Cross-region replication available (opt-in)

## Performance Characteristics

### Before Sharding

```
1 MongoDB Server
- Encounters: 1M+ documents
- Query latency: 100-500ms
- Write throughput: 1,000 ops/sec
- Storage: 1TB+
```

### After Sharding (4 Shards)

```
4 MongoDB Servers
- Encounters per shard: 250K documents
- Query latency: 10-50ms (4x faster)
- Write throughput: 4,000 ops/sec (4x faster)
- Storage per shard: 250GB
```

## Operational Procedures

### Adding a New Shard

```bash
# 1. Deploy new shard server
terraform apply -var="shard_count=5"

# 2. Add to configuration
POST /api/admin/shards/add
Body: {
  "shardName": "shard-5",
  "connectionString": "mongodb://shard-5:27017"
}

# 3. Rebalance data
POST /api/admin/shards/rebalance

# 4. Monitor migration
GET /api/admin/shards/migration-status
```

### Removing a Shard (Decommissioning)

```bash
# 1. Move all data off shard
POST /api/admin/shards/drain
Body: { "shardId": "shard-5" }

# 2. Wait for completion
# Status: "drained"

# 3. Remove from cluster
POST /api/admin/shards/remove
Body: { "shardId": "shard-5" }

# 4. Decommission server
terraform destroy -var="shard_id=shard-5"
```

## Troubleshooting

### Shard Imbalance > 20%

```bash
# Investigate
GET /api/admin/shards/balance

# Fix
POST /api/admin/shards/rebalance
Body: { "targetImbalance": 5 }

# Monitor
GET /api/admin/shards/migration-status
```

### High Query Latency on One Shard

```bash
# Check shard health
GET /api/admin/shards/health

# Possible causes:
# 1. Network congestion
# 2. Disk slow
# 3. Replication lag
# 4. Index missing

# Remediation:
# - Rebuild indexes
# - Restart shard
# - Check network
# - Review slow queries
```

## Future Enhancements

1. **Geographic Sharding**: Distribute by region
2. **Automatic Shard Scaling**: Add shards based on load
3. **Cross-Shard Transactions**: Support multi-shard ACID
4. **Composite Shard Keys**: Clinic + Date for better locality
5. **Shard-local Indexes**: Optimize per-shard indexes

## References

- [MongoDB Sharding Manual](https://docs.mongodb.com/manual/sharding/)
- [Shard Key Selection](https://docs.mongodb.com/manual/core/sharding-shard-key/)
- [Sharding Best Practices](https://docs.mongodb.com/manual/core/sharding-architecture/)
