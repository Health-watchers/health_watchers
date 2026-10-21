#!/usr/bin/env bash
# ============================================================
# ELK Stack Setup Script — Health Watchers
#
# Applies ILM policy, index templates, initial index, and
# imports Kibana dashboards. Designed to run as a one-shot
# Docker container after Elasticsearch and Kibana are healthy.
#
# Issue: #1007 – Log Aggregation with ELK
# ============================================================

set -euo pipefail

ES_URL="${ELASTICSEARCH_URL:-http://elasticsearch:9200}"
ES_USER="${ELASTICSEARCH_USERNAME:-elastic}"
ES_PASS="${ELASTIC_PASSWORD:-changeme}"
KB_URL="${KIBANA_URL:-http://kibana:5601}"

AUTH="-u ${ES_USER}:${ES_PASS}"

ILM_FILE="/etc/elk/ilm-policy.json"
TEMPLATE_FILE="/etc/elk/index-templates.json"
DASHBOARDS_FILE="/etc/elk/dashboards-export.ndjson"
SLM_FILE="/etc/elk/slm-policy.json"
WATCHERS_DIR="/etc/elk/watchers"

echo "=== ELK Stack Setup ==="
echo "Elasticsearch: ${ES_URL}"
echo "Kibana:        ${KB_URL}"
echo ""

# ── Wait for Elasticsearch ───────────────────────────────────
echo "Waiting for Elasticsearch..."
for i in $(seq 1 30); do
  if curl -sf ${AUTH} "${ES_URL}/_cluster/health?wait_for_status=yellow&timeout=5s" > /dev/null 2>&1; then
    echo "✓ Elasticsearch is ready"
    break
  fi
  echo "  Attempt ${i}/30 — retrying in 5s..."
  sleep 5
done

# ── Apply ILM policy ─────────────────────────────────────────
echo ""
echo "Applying ILM policy..."
RESPONSE=$(curl -sf -X PUT ${AUTH} \
  "${ES_URL}/_ilm/policy/health-watchers-policy" \
  -H "Content-Type: application/json" \
  -d @"${ILM_FILE}" 2>&1) || true
echo "  ${RESPONSE}"
echo "✓ ILM policy applied"

# ── Apply index template ──────────────────────────────────────
echo ""
echo "Applying index template..."
RESPONSE=$(curl -sf -X PUT ${AUTH} \
  "${ES_URL}/_index_template/health-watchers-template" \
  -H "Content-Type: application/json" \
  -d @"${TEMPLATE_FILE}" 2>&1) || true
echo "  ${RESPONSE}"
echo "✓ Index template applied"

# ── Apply error index template ────────────────────────────────
echo ""
echo "Applying error index template..."
curl -sf -X PUT ${AUTH} \
  "${ES_URL}/_index_template/health-watchers-errors-template" \
  -H "Content-Type: application/json" \
  -d '{
    "index_patterns": ["health-watchers-errors-*", "health-watchers-audit-*"],
    "priority": 90,
    "template": {
      "settings": {
        "index": {
          "number_of_shards": 1,
          "number_of_replicas": 0,
          "refresh_interval": "10s",
          "lifecycle": { "name": "health-watchers-policy" }
        }
      }
    }
  }' > /dev/null
echo "✓ Error/audit index template applied"

# ── Apply SLM policy (long-term compliance archival) ──────────
echo ""
echo "Applying SLM policy..."
RESPONSE=$(curl -sf -X PUT ${AUTH} \
  "${ES_URL}/_slm/policy/health-watchers-archive" \
  -H "Content-Type: application/json" \
  -d @"${SLM_FILE}" 2>&1) || true
echo "  ${RESPONSE}"
echo "✓ SLM policy applied"

# ── Load Watcher alert definitions ─────────────────────────────
echo ""
echo "Loading Watcher alert definitions..."
if [ -d "${WATCHERS_DIR}" ]; then
  for WATCHER_FILE in "${WATCHERS_DIR}"/*.json; do
    WATCHER_ID=$(basename "${WATCHER_FILE}" .json)
    RESPONSE=$(curl -sf -X PUT ${AUTH} \
      "${ES_URL}/_watcher/watch/${WATCHER_ID}" \
      -H "Content-Type: application/json" \
      -d @"${WATCHER_FILE}" 2>&1) || true
    echo "  ${WATCHER_ID}: ${RESPONSE}"
  done
  echo "✓ Watcher alerts loaded"
else
  echo "⚠ No watchers directory found at ${WATCHERS_DIR} — skipping"
fi

# ── Bootstrap write alias ─────────────────────────────────────
echo ""
echo "Creating bootstrap index with write alias..."
curl -sf -X PUT ${AUTH} \
  "${ES_URL}/health-watchers-000001" \
  -H "Content-Type: application/json" \
  -d '{
    "aliases": {
      "health-watchers-write": {
        "is_write_index": true
      }
    }
  }' > /dev/null 2>&1 || echo "  (index may already exist — skipped)"
echo "✓ Write alias ready"

# ── Wait for Kibana ──────────────────────────────────────────
echo ""
echo "Waiting for Kibana..."
for i in $(seq 1 30); do
  STATUS=$(curl -sf ${AUTH} "${KB_URL}/api/status" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',{}).get('overall',{}).get('level','unknown'))" 2>/dev/null || echo "unknown")
  if [ "${STATUS}" = "available" ] || [ "${STATUS}" = "degraded" ]; then
    echo "✓ Kibana is ready (status: ${STATUS})"
    break
  fi
  echo "  Attempt ${i}/30 — Kibana status: ${STATUS} — retrying in 5s..."
  sleep 5
done

# ── Import Kibana dashboards ──────────────────────────────────
if [ -f "${DASHBOARDS_FILE}" ]; then
  echo ""
  echo "Importing Kibana dashboards..."
  RESPONSE=$(curl -sf -X POST ${AUTH} \
    "${KB_URL}/api/saved_objects/_import?overwrite=true" \
    -H "kbn-xsrf: true" \
    --form "file=@${DASHBOARDS_FILE}" 2>&1) || true
  echo "  ${RESPONSE}"
  echo "✓ Dashboards imported"
else
  echo "⚠ No dashboards file found at ${DASHBOARDS_FILE} — skipping"
fi

# ── Create default index pattern ─────────────────────────────
echo ""
echo "Creating Kibana data view..."
curl -sf -X POST ${AUTH} \
  "${KB_URL}/api/data_views/data_view" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -d '{
    "data_view": {
      "title": "health-watchers-*",
      "name": "Health Watchers Logs",
      "timeFieldName": "@timestamp"
    }
  }' > /dev/null 2>&1 || echo "  (data view may already exist — skipped)"

curl -sf -X POST ${AUTH} \
  "${KB_URL}/api/data_views/data_view" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -d '{
    "data_view": {
      "title": "health-watchers-audit-*",
      "name": "Health Watchers Audit Logs",
      "timeFieldName": "@timestamp"
    }
  }' > /dev/null 2>&1 || echo "  (audit data view may already exist — skipped)"

echo "✓ Data views configured"

echo ""
echo "=============================="
echo " ELK Setup Complete ✓"
echo "=============================="
echo ""
echo "  Elasticsearch : ${ES_URL}"
echo "  Kibana        : ${KB_URL}"
echo "  Logstash      : logstash:5000 (UDP/TCP) | logstash:5044 (Beats)"
echo ""
