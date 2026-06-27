# API Down Runbook

## Alert
APIDown: Health Watchers API is unreachable for > 1 minute

## Severity
🚨 Critical

## Description
The Health Watchers API service is not responding to health checks. This is a critical issue affecting all API consumers.

## Immediate Actions (1-2 minutes)

1. **Verify Alert**
   ```bash
   curl -v http://api:3001/health
   ```
   - Should respond with 200 OK
   - If connection refused, service is down

2. **Check Service Status**
   ```bash
   docker ps | grep health-watchers-api
   docker inspect health-watchers-api-prod
   ```
   - Check if container is running
   - Check restart count and exit status

3. **Page On-Call Immediately**
   - Trigger PagerDuty alert
   - Notify in #alerts-critical Slack channel

## Restart Procedures (2-5 minutes)

### Option 1: Restart Container
```bash
docker restart health-watchers-api-prod
```
- Wait 30 seconds
- Verify health: `curl http://api:3001/health`

### Option 2: Full Service Restart
```bash
docker-compose -f docker-compose.prod.yml down health-watchers-api
docker-compose -f docker-compose.prod.yml up -d health-watchers-api
```
- Wait for container to be healthy

### Option 3: Check Dependencies
```bash
# Verify MongoDB is accessible
curl mongodb:27017

# Check network connectivity
docker network inspect health-watchers-prod
```

## Investigation (5-10 minutes)

1. **Check Container Logs**
   ```bash
   docker logs health-watchers-api-prod --tail=500
   docker logs health-watchers-api-prod --tail=500 | grep ERROR
   ```

2. **Common Causes**
   - MongoDB connection failure
   - OOM (Out of Memory)
   - Port binding conflict
   - Configuration error

3. **Check Resource Constraints**
   ```bash
   docker stats health-watchers-api-prod
   free -h
   df -h
   ```

## Escalation
- **5 minutes**: Page secondary on-call
- **10 minutes**: Page team lead
- **15 minutes**: Page VP Engineering

## Recovery Checklist
- [ ] Service responds to health check
- [ ] Can connect to MongoDB
- [ ] Recent deployments verified
- [ ] Logs reviewed for root cause
- [ ] Incident ticket created
- [ ] Team notified in Slack

## Post-Incident
1. Review logs for root cause
2. Check recent configuration changes
3. Consider adding additional logging
4. Review SLO impact

## Related Alerts
- StellarServiceDown
- MongoDBPoolWaitQueueNonEmpty
