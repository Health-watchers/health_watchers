#!/bin/bash

# ============================================================
# ELK Stack Setup Script
# ============================================================

set -e

ELASTICSEARCH_URL="${ELASTICSEARCH_URL:-http://elasticsearch:9200}"
ELASTICSEARCH_USER="${ELASTICSEARCH_USERNAME:-elastic}"
ELASTICSEARCH_PASS="${ELASTIC_PASSWORD:-changeme}"
AUTH="-u $ELASTICSEARCH_USER:$ELASTICSEARCH_PASS"

echo "Setting up ELK Stack..."
echo "Elasticsearch URL: $ELASTICSEARCH_URL"

# Wait for Elasticsearch to be ready
echo "Waiting for Elasticsearch to be ready..."
for i in {1..30}; do
  if curl -s -f $AUTH "$ELASTICSEARCH_URL/_cluster/health" > /dev/null 2>&1; then
    echo "Elasticsearch is ready!"
    break
  fi
  echo "Attempt $i/30: Waiting for Elasticsearch..."
  sleep 2
done

# Create ILM policy
echo "Creating ILM policy..."
curl -X PUT $AUTH "$ELASTICSEARCH_URL/_ilm/policy/health-watchers-policy" \
  -H "Content-Type: application/json" \
  -d @/workspaces/health_watchers/logging/elasticsearch/ilm-policy.json

# Create index template
echo "Creating index template..."
curl -X PUT $AUTH "$ELASTICSEARCH_URL/_index_template/health-watchers-template" \
  -H "Content-Type: application/json" \
  -d @/workspaces/health_watchers/logging/elasticsearch/index-templates.json

# Create initial index with rollover alias
echo "Creating initial index..."
curl -X PUT $AUTH "$ELASTICSEARCH_URL/health-watchers-000001" \
  -H "Content-Type: application/json" \
  -d '{
    "aliases": {
      "health-watchers-write": {
        "is_write_index": true
      }
    }
  }' 2>/dev/null || true

# Create error index template
echo "Creating error index template..."
curl -X PUT $AUTH "$ELASTICSEARCH_URL/_index_template/health-watchers-errors-template" \
  -H "Content-Type: application/json" \
  -d '{
    "index_patterns": ["health-watchers-errors-*"],
    "template": {
      "settings": {
        "index": {
          "number_of_shards": 1,
          "number_of_replicas": 0
        }
      },
      "mappings": {
        "properties": {
          "timestamp": {"type": "date"},
          "log_level": {"type": "keyword"},
          "message": {"type": "text"},
          "service": {"type": "keyword"},
          "error_type": {"type": "keyword"},
          "stack_trace": {"type": "text", "index": false}
        }
      }
    }
  }'

echo "ELK Stack setup completed!"
echo ""
echo "Access URLs:"
echo "  Elasticsearch: $ELASTICSEARCH_URL"
echo "  Kibana: http://localhost:5601"
echo "  Logstash: http://localhost:9600"
