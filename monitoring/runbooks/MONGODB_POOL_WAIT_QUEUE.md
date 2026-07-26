# MongoDB Connection Pool Wait Queue Non-Empty Runbook

## Alert
MongoDBPoolWaitQueueNonEmpty: Requests waiting for connections detected

## Severity
🚨 Critical

## Description
The MongoDB connection pool is exhausted and new requests are queuing for available connections. This severely impacts application performance.

## Immediate Actions (1-2 minutes)

1. **Verify Condition**
   - Check Grafana "Database Monitoring" dashboard
   - Look at "Connection Pool Utilization" gauge
   - Check "MongoDB Connection Pool Wait Queue" panel

2. **Assess Impact**
   ```bash
   # Check how many requests are waiting
   docker logs health-watchers-api-prod | grep "waiting for connection" | wc -l
   ```

3. **Page On-Call**
   - Trigger PagerDuty for database team
   - Notify #database-alerts channel

## Resolution (2-10 minutes)

### Quick Fix: Restart API Service
```bash
docker restart health-watchers-api-prod
```
- This will close all existing connections
- New connections will be established
- Monitor queue size after restart

### If Restart Doesn't Work

1. **Check MongoDB Health**
   ```bash
   docker exec health-watchers-mongodb-prod mongosh
   > db.adminCommand("ping")
   > db.getServerStatus().connections
   ```

2. **Identify Slow Queries**
   ```bash
   docker exec health-watchers-mongodb-prod mongosh
   > db.adminCommand({"currentOp": true})
   ```
   - Kill long-running operations if needed
   ```bash
   > db.killOp(operationId)
   ```

3. **Check Network Issues**
   - Verify MongoDB container network status
   - Check if database is experiencing I/O issues

### Increase Connection Pool Size
1. Update API configuration (if appropriate)
   ```bash
   # In .env or deployment config
   MONGODB_POOL_SIZE=50  # Increase from default
   ```
2. Restart API service

## Long-term Fixes

1. **Identify Root Cause**
   - Check application query patterns
   - Review recent deployments
   - Look for new slow queries

2. **Optimization Options**
   - Add database indexes
   - Optimize query patterns
   - Implement connection pooling middleware
   - Consider read replicas for read-heavy workloads

3. **Capacity Planning**
   - Monitor peak connection usage
   - Plan for growth
   - Consider MongoDB sharding

## Monitoring After Resolution

1. Watch connection pool utilization for 1 hour
2. Monitor error rates
3. Check request latencies returning to normal
4. Verify no customer complaints

## Related Alerts
- APIDown
- HighErrorRate
- HighP99Latency
