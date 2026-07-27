# MongoDB Replication Optimization Guide

## Overview

This guide covers the optimization of MongoDB replication for the Health Watchers platform. The configuration ensures high availability, consistency, and optimal query performance.

## Architecture

```
┌─────────────────────────────────────────────┐
│         MongoDB Replica Set (rs0)           │
├─────────────────────────────────────────────┤
│  Primary          Secondary      Secondary  │
│  (writes)         (reads)        (reads)    │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │    Oplog Replication (~2ms latency)  │   │
│  └──────────────────────────────────────┘   │
│                                              │
│            Arbiter (votes only)             │
└─────────────────────────────────────────────┘
```

## Read Preferences

### Available Configurations

#### 1. Consistent (Critical Operations)
- **Mode**: Primary
- **Use Case**: Operations requiring guaranteed consistency
- **Write Concern**: Majority with journal
- **Examples**: Patient data updates, financial transactions

```typescript
import { READ_PREFERENCES } from '@/config/db-replication';
const config = READ_PREFERENCES.consistent;
```

#### 2. High Priority
- **Mode**: Primary Preferred
- **Use Case**: Important operations that should use primary if available
- **Write Concern**: Majority with journal
- **Examples**: Important status updates, critical patient info

#### 3. Balanced (Default)
- **Mode**: Secondary Preferred
- **Write Concern**: Majority with journal
- **Max Staleness**: 120 seconds
- **Examples**: General application queries

#### 4. Analytics
- **Mode**: Secondary
- **Write Concern**: Single (1) without journal
- **Max Staleness**: 300 seconds
- **Examples**: Reports, analytics queries, bulk reads

#### 5. Lowest Latency
- **Mode**: Nearest
- **Use Case**: Minimal latency requirement
- **Examples**: Real-time dashboards, user-facing queries

## Replication Lag Monitoring

### Checking Replication Lag

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/v1/replication/lag
```

Response:
```json
{
  "success": true,
  "data": {
    "primary": {
      "host": "mongodb-primary:27017",
      "optime": "2024-07-27T10:00:00Z"
    },
    "secondaries": [
      {
        "host": "mongodb-secondary-1:27017",
        "lagMs": 15,
        "optime": "2024-07-27T10:00:00Z"
      }
    ],
    "maxLagMs": 25,
    "avgLagMs": 12,
    "timestamp": "2024-07-27T10:00:05Z"
  }
}
```

### Lag Thresholds

| Lag (ms) | Status | Action |
|----------|--------|--------|
| 0-50 | Healthy | Monitor |
| 50-200 | Degraded | Investigate load |
| 200+ | Critical | Scale replicas or optimize queries |

## Consistency Monitoring

### API Endpoint

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/v1/replication/consistency
```

Response:
```json
{
  "success": true,
  "data": {
    "isHealthy": true,
    "totalMembers": 4,
    "healthyMembers": 4,
    "unhealthyMembers": [],
    "primaryHealth": true,
    "electionInProgress": false,
    "timestamp": "2024-07-27T10:00:05Z"
  }
}
```

## Failover Testing

### Running Failover Tests

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/v1/replication/test-failover
```

### What Failover Testing Does

1. Connects to each replica set member
2. Measures response times
3. Validates connectivity
4. Reports overall failover readiness

### Expected Results

- All members should be accessible
- Response time < 5 seconds per member
- Total test time < 30 seconds

## Health Status Checks

### Comprehensive Health Check

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/v1/replication/status
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "lagMetrics": { ... },
    "consistency": { ... },
    "issues": []
  }
}
```

### Status Values

- **healthy**: All systems operational
- **degraded**: Some issues detected, but functional
- **critical**: Service may be affected

## Automatic Monitoring

The application automatically monitors replication health at 30-second intervals. Logs will show:

```
High replication lag detected: maxLagMs=5150, avgLagMs=2500
Replication consistency issues detected: unhealthyMembers=[...]
```

## Optimization Best Practices

### 1. Query Optimization
- Use appropriate read preferences per use case
- Monitor slow queries with `db.slowms` configuration
- Use indexes on frequently queried fields

### 2. Connection Pooling
- Maintain 10-30 connections per replica member
- Use connection pooling in application

```typescript
const options = {
  maxPoolSize: 30,
  minPoolSize: 10,
  maxConnecting: 2,
};
```

### 3. Write Operations
- Use majority write concern for critical data
- Consider write performance trade-offs
- Monitor write latency

### 4. Read Preferences
- Route analytics to secondaries
- Keep critical reads on primary
- Use secondaryPreferred for general queries

## Troubleshooting

### High Replication Lag

**Symptoms**: `maxLagMs > 1000`

**Causes**:
- High write throughput
- Slow secondary hardware
- Network latency

**Solutions**:
1. Check secondary disk I/O
2. Review network connectivity
3. Scale write capacity
4. Add additional secondaries

### Election in Progress

**Symptoms**: No primary available for extended period

**Causes**:
- Primary failure
- Network partition
- Arbiter misconfiguration

**Solutions**:
1. Check primary health
2. Verify network connectivity
3. Review arbiter status
4. Manually step down if needed: `rs.stepDown()`

### Consistency Issues

**Symptoms**: Unhealthy members reported

**Causes**:
- Out of memory
- Disk space issues
- Corrupted oplog
- Network problems

**Solutions**:
1. Check disk space: `du -sh /data/db`
2. Monitor memory usage
3. Review member logs
4. Consider member replacement

## Monitoring Dashboard

Key metrics to track:

- Replication lag (max/average)
- Number of healthy members
- Write concern violations
- Query distribution (primary vs secondary)
- Connection pool utilization

## Recovery Procedures

### Re-sync a Secondary

```javascript
// Connect to the affected secondary
use admin
db.adminCommand({resync: 1})
```

### Manual Primary Election

```javascript
use admin
rs.stepDown(300)  // Step down primary for 300 seconds
```

### Rebuild Replica Set

Only as last resort:

1. Stop all mongod processes
2. Remove dbPath directories
3. Restart all mongod instances
4. Reinitialize replica set
5. Restore from backup if needed

## References

- [MongoDB Replication Documentation](https://docs.mongodb.com/manual/replication/)
- [Read Preference Selection](https://docs.mongodb.com/manual/core/read-preference/)
- [Write Concern](https://docs.mongodb.com/manual/reference/write-concern/)
