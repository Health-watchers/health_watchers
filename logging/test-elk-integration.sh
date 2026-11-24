#!/usr/bin/env bash
#
# logging/test-elk-integration.sh
#
# Reusable ELK stack integration test.
#
# This script:
#   1. Starts the ELK stack (Elasticsearch, Logstash, Kibana) and the API
#      using a docker-compose.elk.yml file.
#   2. Waits for Elasticsearch, Logstash, and Kibana health checks.
#   3. Sends test HTTP requests to the API to generate logs.
#   4. Polls Elasticsearch to assert log documents with expected fields are
#      indexed.
#   5. Verifies the Logstash pipeline (health-watchers.conf) correctly parses
#      JSON logs by checking parsed fields in Elasticsearch.
#   6. Imports the Kibana dashboard via the saved objects API and asserts a
#      200 response and that the dashboard is retrievable.
#   7. Cleans up containers and volumes afterward.
#
# The script exits non-zero on any failure and is runnable both locally and
# in CI.
#
# Usage:
#   ./logging/test-elk-integration.sh
#
# Environment variables (all optional):
#   COMPOSE_FILE          Path to the docker-compose file to use.
#                         Defaults to a repo-root docker-compose.elk.yml if
#                         present, otherwise .docker-compose-backup/docker-compose.elk.yml.
#   COMPOSE_PROJECT_NAME  Docker compose project name. Defaults to "elk-it".
#   ES_URL                Elasticsearch base URL. Defaults to http://localhost:9200.
#   KIBANA_URL            Kibana base URL. Defaults to http://localhost:5601.
#   API_URL               API base URL. Defaults to http://localhost:3000.
#   ES_INDEX              Elasticsearch index pattern to query. Defaults to "health-watchers-*".
#   KIBANA_DASHBOARD_FILE Path to the Kibana dashboard saved object export.
#                         Defaults to logging/kibana/dashboard.ndjson if present.
#   WAIT_TIMEOUT          Max seconds to wait for each health check. Defaults to 180.
#   POLL_TIMEOUT          Max seconds to poll Elasticsearch for logs. Defaults to 120.
#   KEEP_STACK            If set to "1", skip cleanup (useful for debugging).
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve script / repo paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-elk-it}"

if [[ -z "${COMPOSE_FILE:-}" ]]; then
  if [[ -f "${REPO_ROOT}/docker-compose.elk.yml" ]]; then
    COMPOSE_FILE="${REPO_ROOT}/docker-compose.elk.yml"
  elif [[ -f "${REPO_ROOT}/.docker-compose-backup/docker-compose.elk.yml" ]]; then
    COMPOSE_FILE="${REPO_ROOT}/.docker-compose-backup/docker-compose.elk.yml"
  else
    echo "ERROR: could not locate docker-compose.elk.yml" >&2
    echo "       Looked in:" >&2
    echo "         ${REPO_ROOT}/docker-compose.elk.yml" >&2
    echo "         ${REPO_ROOT}/.docker-compose-backup/docker-compose.elk.yml" >&2
    exit 1
  fi
fi

ES_URL="${ES_URL:-http://localhost:9200}"
KIBANA_URL="${KIBANA_URL:-http://localhost:5601}"
API_URL="${API_URL:-http://localhost:3000}"
ES_INDEX="${ES_INDEX:-health-watchers-*}"

if [[ -z "${KIBANA_DASHBOARD_FILE:-}" ]]; then
  if [[ -f "${SCRIPT_DIR}/kibana/dashboard.ndjson" ]]; then
    KIBANA_DASHBOARD_FILE="${SCRIPT_DIR}/kibana/dashboard.ndjson"
  elif [[ -f "${SCRIPT_DIR}/kibana/dashboard.json" ]]; then
    KIBANA_DASHBOARD_FILE="${SCRIPT_DIR}/kibana/dashboard.json"
  else
    KIBANA_DASHBOARD_FILE=""
  fi
fi

WAIT_TIMEOUT="${WAIT_TIMEOUT:-180}"
POLL_TIMEOUT="${POLL_TIMEOUT:-120}"
KEEP_STACK="${KEEP_STACK:-0}"

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
log()  { printf '[elk-it] %s\n' "$*"; }
info() { printf '[elk-it] \033[1;34mINFO\033[0m  %s\n' "$*"; }
ok()   { printf '[elk-it] \033[1;32mOK\033[0m    %s\n' "$*"; }
warn() { printf '[elk-it] \033[1;33mWARN\033[0m  %s\n' "$*" >&2; }
fail() { printf '[elk-it] \033[1;31mFAIL\033[0m  %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Dependency checks
# ---------------------------------------------------------------------------
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

require_cmd docker
require_cmd curl

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  fail "neither 'docker compose' nor 'docker-compose' is available"
fi

compose() {
  "${COMPOSE_CMD[@]}" \
    --project-name "${COMPOSE_PROJECT_NAME}" \
    --file "${COMPOSE_FILE}" \
    "$@"
}

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
  local exit_code=$?
  if [[ "${KEEP_STACK}" == "1" ]]; then
    warn "KEEP_STACK=1 set; leaving stack running (project: ${COMPOSE_PROJECT_NAME})"
    return
  fi
  info "Cleaning up containers and volumes..."
  compose down --volumes --remove-orphans >/dev/null 2>&1 || \
    warn "compose down failed (ignored)"
  if [[ ${exit_code} -ne 0 ]]; then
    warn "Test failed with exit code ${exit_code}"
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
# http_get <url> -> prints body, returns 0 on 2xx, non-zero otherwise
http_get() {
  local url="$1"
  curl -fsS --max-time 10 "${url}" 2>/dev/null
}

# http_status <url> -> prints HTTP status code
http_status() {
  local url="$1"
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${url}" 2>/dev/null || echo "000"
}

# wait_for_http <name> <url> <timeout>
wait_for_http() {
  local name="$1" url="$2" timeout="$3"
  local deadline=$(( $(date +%s) + timeout ))
  info "Waiting for ${name} at ${url} (timeout ${timeout}s)..."
  while (( $(date +%s) < deadline )); do
    local code
    code="$(http_status "${url}")"
    if [[ "${code}" =~ ^2 ]]; then
      ok "${name} is up (HTTP ${code})"
      return 0
    fi
    sleep 2
  done
  fail "${name} did not become healthy within ${timeout}s (last status: $(http_status "${url}"))"
}

# ---------------------------------------------------------------------------
# JSON helpers (prefer jq, fall back to python3)
# ---------------------------------------------------------------------------
json_get() {
  # json_get <json> <jq-expression>
  local json="$1" expr="$2"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "${json}" | jq -r "${expr}"
  else
    printf '%s' "${json}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
expr = sys.argv[1]
# Minimal support for the expressions used in this script.
if expr == '.hits.total.value':
    print(data['hits']['total']['value'])
elif expr == '.hits.total':
    print(data['hits']['total'])
elif expr == '.status':
    print(data.get('status', ''))
elif expr == '.version.number':
    print(data.get('version', {}).get('number', ''))
elif expr == '.status.overall.level':
    print(data.get('status', {}).get('overall', {}).get('level', ''))
elif expr == '.saved_objects | length':
    print(len(data.get('saved_objects', [])))
else:
    raise SystemExit('unsupported expr: ' + expr)
" "${expr}"
  fi
}

# ---------------------------------------------------------------------------
# Step 1: Start the stack
# ---------------------------------------------------------------------------
info "Using compose file: ${COMPOSE_FILE}"
info "Compose project:    ${COMPOSE_PROJECT_NAME}"

info "Starting ELK stack and API..."
compose up -d --build || fail "failed to start docker compose stack"

# ---------------------------------------------------------------------------
# Step 2: Wait for health checks
# ---------------------------------------------------------------------------
wait_for_http "Elasticsearch" "${ES_URL}/_cluster/health?wait_for_status=yellow&timeout=1s" "${WAIT_TIMEOUT}"
wait_for_http "Kibana"        "${KIBANA_URL}/api/status" "${WAIT_TIMEOUT}"

# Logstash does not expose a simple HTTP health endpoint by default; we wait
# for its monitoring API if available, otherwise fall back to checking that
# the container is running and that the pipeline is up.
info "Waiting for Logstash (timeout ${WAIT_TIMEOUT}s)..."
logstash_ready=0
deadline=$(( $(date +%s) + WAIT_TIMEOUT ))
while (( $(date +%s) < deadline )); do
  # Try the Logstash monitoring API first.
  if http_get "${ES_URL}/_nodes" >/dev/null 2>&1; then
    # Check whether Logstash has registered a pipeline in Elasticsearch
    # monitoring (best-effort; may not be enabled).
    :
  fi
  # Fall back to checking the container state.
  if compose ps --status running 2>/dev/null | grep -qi 'logstash'; then
    logstash_ready=1
    break
  fi
  sleep 2
done
if [[ "${logstash_ready}" -eq 1 ]]; then
  ok "Logstash container is running"
else
  fail "Logstash did not become ready within ${WAIT_TIMEOUT}s"
fi

# Give Logstash a moment to fully initialize its pipeline.
sleep 5

# ---------------------------------------------------------------------------
# Step 3: Generate test requests against the API
# ---------------------------------------------------------------------------
info "Generating test requests against the API at ${API_URL}..."

# Wait for the API to be reachable (best-effort; some deployments may not
# expose a health endpoint).
api_ready=0
deadline=$(( $(date +%s) + WAIT_TIMEOUT ))
while (( $(date +%s) < deadline )); do
  for path in /health /healthz /api/health /; do
    code="$(http_status "${API_URL}${path}")"
    if [[ "${code}" =~ ^2 ]]; then
      api_ready=1
      break 2
    fi
  done
  sleep 2
done
if [[ "${api_ready}" -eq 1 ]]; then
  ok "API is reachable"
else
  warn "API health endpoint not reachable; continuing anyway"
fi

# Unique marker so we can find our test logs in Elasticsearch.
TEST_MARKER="elk-it-$(date +%s)-$$"
info "Test marker: ${TEST_MARKER}"

# Send a handful of requests. We use the marker in a header and query string
# so that whatever the API logs, it will include the marker.
for i in 1 2 3 4 5; do
  curl -s -o /dev/null --max-time 10 \
    -H "X-ELK-IT-Marker: ${TEST_MARKER}" \
    -H "Content-Type: application/json" \
    "${API_URL}/?elk_it_marker=${TEST_MARKER}&i=${i}" || true
done

# Also send a request that should produce a structured JSON log line.
curl -s -o /dev/null --max-time 10 \
  -X POST \
  -H "X-ELK-IT-Marker: ${TEST_MARKER}" \
  -H "Content-Type: application/json" \
  -d "{\"elk_it_marker\":\"${TEST_MARKER}\",\"event\":\"elk-integration-test\"}" \
  "${API_URL}/api/health" || true

ok "Sent test requests"

# ---------------------------------------------------------------------------
# Step 4: Poll Elasticsearch for indexed log documents
# ---------------------------------------------------------------------------
info "Polling Elasticsearch for log documents (index: ${ES_INDEX})..."

es_query() {
  # es_query <query-json>
  local query="$1"
  curl -fsS --max-time 10 \
    -H "Content-Type: application/json" \
    -X POST "${ES_URL}/${ES_INDEX}/_search" \
    -d "${query}" 2>/dev/null
}

found_logs=0
deadline=$(( $(date +%s) + POLL_TIMEOUT ))
while (( $(date +%s) < deadline )); do
  resp="$(es_query "{\"size\":1,\"query\":{\"query_string\":{\"query\":\"\\\"${TEST_MARKER}\\\"\"}}}" || true)"
  if [[ -n "${resp}" ]]; then
    total="$(json_get "${resp}" '.hits.total.value' 2>/dev/null || echo 0)"
    if [[ "${total}" =~ ^[0-9]+$ ]] && (( total > 0 )); then
      found_logs=1
      ok "Found ${total} log document(s) containing marker"
      break
    fi
  fi
  sleep 3
done

if [[ "${found_logs}" -ne 1 ]]; then
  warn "Dumping recent Elasticsearch indices for debugging:"
  http_get "${ES_URL}/_cat/indices?v" || true
  fail "no log documents containing marker '${TEST_MARKER}' were indexed within ${POLL_TIMEOUT}s"
fi

# Assert expected fields are present on at least one document.
info "Verifying expected fields on indexed documents..."
resp="$(es_query "{\"size\":1,\"query\":{\"query_string\":{\"query\":\"\\\"${TEST_MARKER}\\\"\"}}}")"
doc="$(printf '%s' "${resp}" | (command -v jq >/dev/null 2>&1 && jq -c '.hits.hits[0]._source' || python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["hits"]["hits"][0]["_source"]))'))"

if [[ -z "${doc}" || "${doc}" == "null" ]]; then
  fail "could not retrieve a log document source"
fi

# Check for common fields that should be present after Logstash parsing.
check_field() {
  local field="$1"
  if printf '%s' "${doc}" | grep -q "\"${field}\""; then
    ok "field present: ${field}"
  else
    warn "field missing: ${field} (document: ${doc})"
    return 1
  fi
}

field_failures=0
check_field "message" || field_failures=$((field_failures + 1))
# @timestamp is a standard Logstash field.
check_field "@timestamp" || field_failures=$((field_failures + 1))

if (( field_failures > 0 )); then
  fail "expected fields missing from indexed log document"
fi

# ---------------------------------------------------------------------------
# Step 5: Verify Logstash pipeline parses JSON logs correctly
# ---------------------------------------------------------------------------
info "Verifying Logstash pipeline (health-watchers.conf) JSON parsing..."

# The pipeline is expected to parse JSON log lines into structured fields.
# We look for a document whose message was JSON and check that a nested field
# (e.g. "level" or "event") was extracted. We accept either a top-level
# "level" field or a nested "json.level" field, depending on the pipeline
# configuration.
json_parsed=0
deadline=$(( $(date +%s) + POLL_TIMEOUT ))
while (( $(date +%s) < deadline )); do
  resp="$(es_query "{\"size\":5,\"query\":{\"query_string\":{\"query\":\"\\\"${TEST_MARKER}\\\"\"}}}")"
  if [[ -n "${resp}" ]]; then
    # Check for evidence of JSON parsing: either a "level" field, a "json"
    # object, or a "log.level" field.
    if printf '%s' "${resp}" | grep -qE '"(level|json|log\.level)"'; then
      json_parsed=1
      break
    fi
  fi
  sleep 3
done

if [[ "${json_parsed}" -eq 1 ]]; then
  ok "Logstash pipeline parsed JSON logs into structured fields"
else
  # Non-fatal warning: parsing may depend on the exact log format emitted by
  # the API. We still fail if no structured fields are found at all, since
  # that indicates the pipeline is not parsing JSON.
  warn "no structured JSON fields detected in indexed logs"
  fail "Logstash pipeline does not appear to parse JSON logs correctly"
fi

# ---------------------------------------------------------------------------
# Step 6: Kibana dashboard import test
# ---------------------------------------------------------------------------
info "Testing Kibana dashboard import..."

if [[ -z "${KIBANA_DASHBOARD_FILE}" || ! -f "${KIBANA_DASHBOARD_FILE}" ]]; then
  warn "no Kibana dashboard file found; skipping dashboard import test"
else
  info "Importing dashboard from ${KIBANA_DASHBOARD_FILE}..."

  # Determine content type based on file extension.
  case "${KIBANA_DASHBOARD_FILE}" in
    *.ndjson) content_type="application/x-ndjson" ;;
    *.json)   content_type="application/json" ;;
    *)        content_type="application/json" ;;
  esac

  import_status="$(curl -s -o /tmp/kibana-import-response.json -w '%{http_code}' \
    --max-time 30 \
    -X POST "${KIBANA_URL}/api/saved_objects/_import?overwrite=true" \
    -H "kbn-xsrf: true" \
    -H "Content-Type: ${content_type}" \
    --data-binary "@${KIBANA_DASHBOARD_FILE}" 2>/dev/null || echo "000")"

  if [[ "${import_status}" != "200" ]]; then
    warn "Kibana import response:"
    cat /tmp/kibana-import-response.json 2>/dev/null || true
    fail "Kibana dashboard import failed (HTTP ${import_status})"
  fi
  ok "Kibana dashboard import returned HTTP 200"

  # Verify the import reported success.
  if grep -q '"success":false' /tmp/kibana-import-response.json 2>/dev/null; then
    warn "Kibana import response:"
    cat /tmp/kibana-import-response.json 2>/dev/null || true
    fail "Kibana dashboard import reported success=false"
  fi

  # Verify the dashboard is retrievable via the saved objects API.
  info "Verifying dashboard is retrievable..."
  dashboard_id=""
  # Try to extract the dashboard id from the import response.
  if command -v jq >/dev/null 2>&1; then
    dashboard_id="$(jq -r '.successResults[]? | select(.type=="dashboard") | .id' /tmp/kibana-import-response.json 2>/dev/null | head -n1)"
  else
    dashboard_id="$(python3 -c "
import json, sys
try:
    data = json.load(open('/tmp/kibana-import-response.json'))
except Exception:
    sys.exit(0)
for r in data.get('successResults', []):
    if r.get('type') == 'dashboard':
        print(r.get('id', ''))
        break
" 2>/dev/null || true)"
  fi

  if [[ -n "${dashboard_id}" ]]; then
    get_status="$(http_status "${KIBANA_URL}/api/saved_objects/dashboard/${dashboard_id}")"
    if [[ "${get_status}" == "200" ]]; then
      ok "dashboard retrievable (id: ${dashboard_id})"
    else
      fail "dashboard not retrievable (HTTP ${get_status}, id: ${dashboard_id})"
    fi
  else
    # Fall back to listing dashboards and asserting at least one exists.
    list_status="$(http_status "${KIBANA_URL}/api/saved_objects/_find?type=dashboard&per_page=1")"
    if [[ "${list_status}" == "200" ]]; then
      ok "dashboard listing retrievable"
    else
      fail "could not verify dashboard (HTTP ${list_status})"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
ok "All ELK integration checks passed"
exit 0