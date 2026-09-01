# ELK Stack - Log Aggregation for Health Watchers

This directory contains the complete ELK (Elasticsearch, Logstash, Kibana) stack configuration for centralizing and analyzing application logs.

## Components

### Elasticsearch
- **Port**: 9200
- **Data Storage**: Persistent volume at `/data/elasticsearch`
- **Index Management**: Automated via ILM policies; 90-day retention on the live/searchable cluster, with daily snapshots to a long-term archive for HIPAA's 7-year compliance window (see [Log Compliance Archival](#log-compliance-archival))
- **Security**: Authentication enabled with username/password

### Logstash
- **Port**: 5000 (TCP/UDP for syslog)
- **Port**: 8080 (HTTP for direct integration)
- **Port**: 9600 (Monitoring API)
- **Function**: Parses, enriches, and transforms logs before sending to Elasticsearch

### Kibana
- **Port**: 5601
- **Function**: Visualization and log analysis interface
- **Default Dashboards**: Pre-built dashboards for common use cases

## Startup

### Using Docker Compose

```bash
# Start the ELK stack
docker-compose -f docker-compose.elk.yml up -d

# Run the setup script
docker exec health-watchers-elasticsearch bash /workspaces/health_watchers/logging/setup-elk.sh
```

### Environment Variables

Required in `.env` file:

```bash
ELASTICSEARCH_USERNAME=elastic
ELASTIC_PASSWORD=your_secure_password
ENVIRONMENT=production
CLUSTER=primary
```

## Configuration Files

### elasticsearch.yml
Core Elasticsearch configuration including:
- Cluster and node settings
- Index management rules
- Performance tuning parameters
- Security configuration

### logstash/pipeline/health-watchers.conf
Input → Filter → Output pipeline that:
- Accepts logs from UDP, TCP, and HTTP
- Parses JSON logs from API and Stellar services
- Enriches logs with metadata
- Removes sensitive data (passwords, tokens)
- Routes error logs to separate indices

### kibana.yml
Kibana configuration for visualization dashboard

### index-templates.json
Defines index structure, field types, and mappings for optimal search and aggregation

### ilm-policy.json
Index Lifecycle Management policy defining:
- **Hot** (0 days): Real-time indexing, high priority
- **Warm** (3 days): Read-optimized, merged indices
- **Cold** (30 days): Frozen from writes, allocated to cold nodes
- **Frozen** (60 days): Mounted as a searchable snapshot against the `health-watchers-archive` repository
- **Delete** (90 days): Automatic deletion from the live cluster

See [Log Compliance Archival](#log-compliance-archival) for how data survives past the 90-day delete phase.

### slm-policy.json
Snapshot Lifecycle Management policy that snapshots `health-watchers-*` indices daily to the `health-watchers-archive` repository, retained for 7 years (see [Log Compliance Archival](#log-compliance-archival))

### watchers/
Elasticsearch Watcher definitions for alerting on log patterns (see [Alerting](#alerting))

## Sending Logs

### From Docker Containers

To forward container logs to Logstash, use the logging driver:

```yaml
services:
  api:
    logging:
      driver: "json-file"
      options:
        labels: "service=api"
        env: "LOG_LEVEL,SERVICE"
```

Then configure a Filebeat sidecar or rsyslog forwarder to send to Logstash:

```bash
docker run -d \
  --name filebeat \
  --volumes-from=health-watchers-api-prod \
  docker.elastic.co/beats/filebeat:8.0.0
```

### From Applications

**Node.js example:**

```javascript
const winston = require('winston');
const dgram = require('dgram');

const syslogUDP = {
  send: (msg) => {
    const client = dgram.createSocket('udp4');
    client.send(msg, 5000, 'logstash', () => client.close());
  }
};

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),
    new (require('winston-syslog')).Syslog({
      app_name: 'health-watchers-api',
      format: winston.format.json()
    })
  ]
});

// Logs sent to syslog will be forwarded by Logstash
logger.info('User login', { user_id: '123', request_id: 'req-456' });
```

## Index Management

### Index Naming Convention
- **Application logs**: `health-watchers-YYYY.MM.dd`
- **Error logs**: `health-watchers-errors-critical-YYYY.MM.dd`
- **Rollover alias**: `health-watchers-write`

### Viewing Indices

```bash
# List all indices
curl -u elastic:password http://localhost:9200/_cat/indices?v

# Get index stats
curl -u elastic:password http://localhost:9200/_stats

# View ILM status
curl -u elastic:password http://localhost:9200/_ilm/status
```

### Manual Index Management

```bash
# Create index with ILM
curl -X POST -u elastic:password http://localhost:9200/health-watchers-%{now/d}

# Delete old indices (careful!)
curl -X DELETE -u elastic:password http://localhost:9200/health-watchers-2024.01.01

# Force ILM policy check
curl -X POST -u elastic:password http://localhost:9200/_ilm/policy/health-watchers-policy/_move
```

## Kibana Dashboards

### Available Dashboards

1. **Health Watchers - Log Overview**
   - Log volume by level
   - Error rate trends
   - Top errors
   - Response time distribution
   - Slow requests (>1s)

2. **API Performance**
   - Requests by endpoint
   - Latency percentiles
   - Error breakdown
   - Status code distribution

3. **Errors & Troubleshooting**
   - Critical errors (filtered)
   - Stack trace analysis
   - Error trends
   - Services with highest error rates

### Creating Custom Visualizations

1. Go to Kibana (http://localhost:5601)
2. Click "Discover" → Select index pattern `health-watchers-*`
3. Click "Visualize" to create new charts
4. Save and add to dashboards

### Search Query Examples

```
# Find all errors
log_level: ERROR

# Find slow API requests
http_path: "/api/*" AND response_time_ms:[1000 TO *]

# Find errors from specific user
user_id: "12345" AND is_error: true

# Response time distribution by endpoint
http_path: * | stats avg(response_time_ms), max(response_time_ms) by http_path

# Error rate by hour
is_error: true | stats count() by timestamp
```

## Alerting

Elasticsearch Watcher definitions live in `elasticsearch/watchers/` and are loaded automatically by `setup-elk.sh`. Each watch polls its target index on a rolling window and posts to a webhook when a threshold is crossed.

| File | Watches | Threshold | Index |
|------|---------|-----------|-------|
| `critical-error-rate.json` | CRITICAL/FATAL log volume | >20 in 5 min | `health-watchers-errors-critical-*` |
| `failed-auth-spike.json` | Failed login attempts (`audit_action: login`, `audit_outcome: failure`) | >20 in 5 min | `health-watchers-audit-*` |

Both watches post to a placeholder webhook URL (`https://hooks.example.com/CHANGE_ME`) — **replace this with a real Slack incoming-webhook or PagerDuty Events API URL** before enabling in production (see the `_meta.notes` field in each watch file).

### Loading a Watch Manually

```bash
curl -X PUT -u elastic:password "http://localhost:9200/_watcher/watch/critical-error-rate" \
  -H "Content-Type: application/json" \
  -d @elasticsearch/watchers/critical-error-rate.json

curl -X PUT -u elastic:password "http://localhost:9200/_watcher/watch/failed-auth-spike" \
  -H "Content-Type: application/json" \
  -d @elasticsearch/watchers/failed-auth-spike.json
```

### Checking Watch Status

```bash
curl -u elastic:password http://localhost:9200/_watcher/watch/critical-error-rate
```

## Log Compliance Archival

HIPAA requires health-record-related logs to be retrievable for **7 years**, but the ILM policy above deletes indices from the live cluster after 90 days (fast tier storage isn't sized or priced for years of data). These are reconciled with two separate mechanisms:

1. **ILM (`ilm-policy.json`)** governs the live, searchable cluster only: hot → warm → cold → frozen (searchable snapshot, mounted read-only at 60 days) → **delete at 90 days**. This keeps live cluster storage bounded and unaffected by long-term retention.
2. **SLM (`slm-policy.json`)** independently snapshots every `health-watchers-*` index nightly to the `health-watchers-archive` snapshot repository (S3), retained for **2555 days (7 years)** before expiring. Because SLM snapshots run daily — well before the 90-day ILM delete phase removes an index from the live cluster — every index is durably archived before it is deleted.

In short: an index disappears from the live, queryable cluster at 90 days, but a snapshot of it already exists in `health-watchers-archive` and stays there for 7 years to satisfy HIPAA record-retention requirements. Restoring an archived index for e-discovery or audit requires `POST _snapshot/health-watchers-archive/<snapshot>/_restore`.

### One-Time Snapshot Repository Registration

Before SLM or the ILM `frozen` phase can use `health-watchers-archive`, register it once per environment:

```bash
curl -X PUT -u elastic:password "http://localhost:9200/_snapshot/health-watchers-archive" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "s3",
    "settings": {
      "bucket": "<YOUR_S3_BUCKET>",
      "region": "<YOUR_AWS_REGION>",
      "base_path": "health-watchers/elasticsearch",
      "role_arn": "<YOUR_IAM_ROLE_ARN>",
      "server_side_encryption": true
    }
  }'
```

`<YOUR_S3_BUCKET>`, `<YOUR_AWS_REGION>`, and `<YOUR_IAM_ROLE_ARN>` are placeholders — fill in per-environment values (a dedicated, versioned, encrypted bucket with a lifecycle policy preventing deletion for 7 years is recommended). The `repository-s3` plugin must be installed on every Elasticsearch node.

### Applying the SLM Policy

```bash
curl -X PUT -u elastic:password "http://localhost:9200/_slm/policy/health-watchers-archive" \
  -H "Content-Type: application/json" \
  -d @elasticsearch/slm-policy.json
```

## Troubleshooting

### Logs Not Appearing in Kibana

1. **Check Logstash**
   ```bash
   docker logs health-watchers-logstash
   ```

2. **Verify Elasticsearch connectivity**
   ```bash
   curl -u elastic:password http://localhost:9200/_cluster/health
   ```

3. **Check log format**
   - Logs must be valid JSON or syslog format
   - Verify Logstash pipeline configuration

4. **Check index pattern**
   - Kibana needs an index pattern matching `health-watchers-*`
   - Create manually in Kibana if not auto-created

### High Disk Usage

1. Check index sizes:
   ```bash
   curl -u elastic:password http://localhost:9200/_cat/indices?v&s=store.size:desc
   ```

2. Force ILM to move indices to older phases:
   ```bash
   curl -X POST -u elastic:password http://localhost:9200/_ilm/move/health-watchers-000001
   ```

3. Delete indices manually if needed:
   ```bash
   curl -X DELETE -u elastic:password "http://localhost:9200/health-watchers-2024.01.*"
   ```

### Slow Queries

1. Check slow log settings:
   ```bash
   curl -u elastic:password http://localhost:9200/health-watchers-*/_settings?pretty
   ```

2. Enable slow logs:
   ```bash
   curl -X PUT -u elastic:password http://localhost:9200/health-watchers-*/_settings -d '{
     "index.search.slowlog.threshold.query.warn": "1s"
   }'
   ```

## Performance SLAs

Target service levels for the logging pipeline:

| Metric | Target | Notes |
|--------|--------|-------|
| Search latency (p95) | < 500ms | Below the 1s slow-query warn threshold (see [Slow Queries](#slow-queries)) |
| Ingest rate | 5,000 events/sec sustained | Per Logstash node; scale `pipeline.workers`/batch size to hold this (see Performance Tuning below) |
| Index refresh interval | 30s | As configured in `index-templates.json` (`index.refresh_interval`) |
| Max result window | 50,000 docs | As configured in `index-templates.json` (`index.max_result_window`); use `search_after`/scroll beyond this |

These are targets, not hard limits — review them against real traffic once the stack has run in production for a full retention cycle.

## Performance Tuning

### Elasticsearch Heap Size
- Set in `docker-compose.elk.yml`
- Default: 512MB (adjust based on data volume)
- Rule: 50% of system RAM, max 32GB

### Logstash Performance
- Adjust `pipeline.workers` in `logstash.yml` (default: 4)
- Increase `pipeline.batch.size` for higher throughput
- Monitor with: `curl http://localhost:9600/`

### Index Refresh Interval
- Set to 30s for balance between freshness and performance
- Lower values = higher CPU/IO
- Can be adjusted in ILM policy

## Security

### Access Control

1. Change default password:
   ```bash
   curl -X POST "http://localhost:9200/_security/user/elastic/_password" \
     -H "Content-Type: application/json" \
     -d '{"password":"new_password"}'
   ```

2. Create read-only user for Kibana:
   ```bash
   curl -X POST "http://localhost:9200/_security/user/kibana_user" \
     -H "Content-Type: application/json" \
     -d '{
       "password": "password",
       "roles": ["viewer"],
       "full_name": "Kibana Viewer"
     }'
   ```

### Backup Strategy

1. Create snapshot repository:
   ```bash
   curl -X PUT -u elastic:password "http://localhost:9200/_snapshot/backup" \
     -H "Content-Type: application/json" \
     -d '{
       "type": "fs",
       "settings": {"location": "/backup"}
     }'
   ```

2. Take snapshot:
   ```bash
   curl -X PUT -u elastic:password "http://localhost:9200/_snapshot/backup/snap-$(date +%Y%m%d)"
   ```

## Monitoring

### Health Check Endpoint
```bash
# Elasticsearch cluster health
curl -u elastic:password http://localhost:9200/_cluster/health

# Logstash status
curl http://localhost:9600/

# Kibana status
curl http://localhost:5601/api/status
```

### Metrics to Monitor
- JVM heap usage (alert >80%)
- Disk usage (alert >85%)
- Query latency (alert >1s)
- Index creation rate
- Shard allocation status

## Support

For issues or questions:
1. Check Elasticsearch documentation: https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html
2. Review logs: `docker logs health-watchers-elasticsearch`
3. Contact DevOps team
