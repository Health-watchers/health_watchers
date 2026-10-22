# Redis Cache Down

**Issue #1577**: Operational runbook for Redis cache failures.

---

## Symptoms

- Cache misses spike to 100% (normally < 5%)
- Application responses slow from < 100ms to > 1s
- Connection refused errors in application logs
- Redis latency > 500ms or timeouts

---

## Impact

**Severity**: HIGH
- Patient portal slow/unresponsive
- Clinic dashboard timeouts
- API rate limiting less effective (no capacity tracking)
- Real-time notifications delayed

---

## Diagnosis

```bash
# Check Redis connectivity
redis-cli ping
# Expected: PONG

# Check Redis memory usage
redis-cli info memory | grep used_memory_human
# If > 80% of max_memory, that's the issue

# Check connected clients
redis-cli client list | wc -l
# Normal: < 50 clients

# Check key count
redis-cli dbsize
# If sudden spike, memory leak possible
```

---

## Resolution

### Step 1: Try Restart (5 minutes)

```bash
# Graceful restart
kubectl rollout restart statefulset/redis -n health-watchers

# Monitor
kubectl logs -f statefulset/redis -n health-watchers
# Wait for "Ready to accept connections"

# Verify health
kubectl exec redis-0 -n health-watchers -- redis-cli ping
```

### Step 2: If Still Down (15 minutes)

Check persisted data:

```bash
# Verify dump.rdb exists and is recent
kubectl exec redis-0 -n health-watchers -- ls -lh /data/dump.rdb

# If corrupted, restore from backup
kubectl exec redis-0 -n health-watchers -- redis-cli BGSAVE

# If BGSAVE hangs, force stop:
kubectl exec redis-0 -n health-watchers -- redis-cli SHUTDOWN NOSAVE
```

### Step 3: Scale Down Application (if memory crisis)

```bash
# Reduce traffic to prevent cascading failures
kubectl scale deployment/api -n health-watchers --replicas=1

# Clear non-critical cache keys
redis-cli --scan --pattern "cache:session:*" | xargs redis-cli del

# Restart API servers to reset connections
kubectl rollout restart deployment/api -n health-watchers
```

---

## Prevention

1. **Set Max Memory Policy**
   ```bash
   redis-cli CONFIG SET maxmemory-policy allkeys-lru
   ```

2. **Monitor Cache Hit Ratio**
   - Alert if < 80% (normally > 95%)
   - Investigate if sudden drop

3. **Enable Persistence**
   ```
   # In redis.conf
   save 900 1      # Save if 1 key changes in 900 sec
   save 300 10     # Save if 10 keys change in 300 sec
   appendonly yes  # Enable AOF (append-only file)
   ```

4. **Regular Backups**
   ```bash
   # Daily backup to S3
   0 2 * * * redis-cli BGSAVE && aws s3 cp /data/dump.rdb s3://backups/redis/
   ```

---

## Escalation

If still down after 30 minutes:
- Page on-call Redis engineer
- Consider failover to read replicas
- Warn clinic admins of portal degradation
- Begin manual session recovery from MongoDB

---

**Issue #1577**: Operational runbook for Redis cache failure scenarios.
