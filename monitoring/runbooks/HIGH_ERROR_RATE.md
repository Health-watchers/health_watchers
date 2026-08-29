# High Error Rate Runbook

## Alert
HighErrorRate: Error rate exceeds 5% over 5 minutes

## Severity
⚠️ Warning

## Description
The HTTP error rate (5xx responses) has exceeded 5% for more than 2 minutes. This indicates a problem with the API service.

## Initial Investigation (5 minutes)

1. **Check Alert Details**
   - Navigate to Grafana dashboard "API Performance"
   - Look at the "API Errors by Status Code" panel
   - Note which endpoints are returning errors

2. **Check Service Health**
   ```bash
   curl http://api:3001/health
   ```
   - Should return 200 OK
   - Check recent logs: `docker logs health-watchers-api-prod`

3. **Check Database Connection**
   ```bash
   curl http://api:3001/health/db
   ```
   - Verify MongoDB is accessible

## Remediation Steps (10 minutes)

### If Database is the Issue
1. Check MongoDB connection pool utilization
   - Look at "Database Monitoring" dashboard
   - If utilization > 80%, restart API service
   ```bash
   docker restart health-watchers-api-prod
   ```

### If Specific Endpoint Failing
1. Check logs for errors on that endpoint
   ```bash
   docker logs health-watchers-api-prod | grep "ERROR" | tail -100
   ```
2. Review recent deployments
3. Consider rolling back if recently deployed

### If Service Resource Constrained
1. Check container resources
   ```bash
   docker stats health-watchers-api-prod
   ```
2. Increase resource limits if needed
3. Restart container if memory usage > 90%

## Escalation
- If error rate doesn't decrease within 15 minutes, page on-call engineer
- If affecting payments, page security team immediately

## Post-Resolution
1. Document root cause in incident ticket
2. Create ticket to prevent recurrence
3. Review logs for patterns
4. Update dashboards if needed

## Related Alerts
- APIDown
- HighP99Latency
- MongoDBPoolHighUtilization
