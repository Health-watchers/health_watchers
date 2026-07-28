# ELK Stack - Log Aggregation for Health Watchers

This directory contains the complete ELK (Elasticsearch, Logstash, Kibana) stack configuration for centralizing and analyzing application logs.

## Components

### Elasticsearch
- **Port**: 9200
- **Data Storage**: Persistent volume at `/data/elasticsearch`
- **Index Management**: Automated via ILM policies with 90-day retention
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
- **Warm** (7 days): Read-optimized, merged indices
- **Cold** (30 days): Searchable snapshots for long-term storage
- **Delete** (90 days): Automatic deletion

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
