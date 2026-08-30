#!/bin/bash
# scripts/observability/incident-response.sh
# Incident-response automation (#1257).
#
# Triggered by an AlertManager webhook (or run by hand with --alert) it:
#   1. opens an incident workspace under docs/incidents/<id>/
#   2. snapshots the current signals — pod status, recent error logs, key
#      Prometheus series, the firing alerts
#   3. seeds the incident doc from docs/templates/INCIDENT_COMMUNICATION.md
#   4. posts the "Investigating" update to Slack
#
# Usage:
#   incident-response.sh --alert "HighErrorRate" [--severity critical] [--service api]
#   incident-response.sh --from-webhook <alertmanager-payload.json>
#
# Env: PROM_URL (http://prometheus:9090), SLACK_WEBHOOK_URL, KUBE_NAMESPACE
#      (health-watchers), LOKI_URL (optional)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROM_URL="${PROM_URL:-http://prometheus:9090}"
KUBE_NAMESPACE="${KUBE_NAMESPACE:-health-watchers}"
ALERT="" SEVERITY="unknown" SERVICE="api" WEBHOOK_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --alert) ALERT="$2"; shift 2 ;;
    --severity) SEVERITY="$2"; shift 2 ;;
    --service) SERVICE="$2"; shift 2 ;;
    --from-webhook) WEBHOOK_FILE="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -n "$WEBHOOK_FILE" ]]; then
  ALERT=$(grep -o '"alertname":"[^"]*"' "$WEBHOOK_FILE" | head -1 | cut -d'"' -f4)
  SEVERITY=$(grep -o '"severity":"[^"]*"' "$WEBHOOK_FILE" | head -1 | cut -d'"' -f4)
fi
[[ -z "$ALERT" ]] && { echo "no alert name resolved" >&2; exit 1; }

INCIDENT_ID="inc-$(date -u +%Y%m%dT%H%M%SZ)-$(echo "$ALERT" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-')"
DIR="$ROOT/docs/incidents/$INCIDENT_ID"
mkdir -p "$DIR"
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

log "Opening incident workspace $DIR"

# ── 1. Kubernetes snapshot ────────────────────────────────────────────────
if command -v kubectl >/dev/null; then
  {
    echo "### pods"; kubectl -n "$KUBE_NAMESPACE" get pods -o wide 2>&1
    echo; echo "### recent events"
    kubectl -n "$KUBE_NAMESPACE" get events --sort-by=.lastTimestamp 2>&1 | tail -40
    echo; echo "### rollout status (api)"
    kubectl -n "$KUBE_NAMESPACE" rollout status deploy/api --timeout=5s 2>&1 || true
  } > "$DIR/k8s-snapshot.txt"
fi

# ── 2. Prometheus signal snapshot ────────────────────────────────────────
q() { curl -sf --data-urlencode "query=$1" "$PROM_URL/api/v1/query" 2>/dev/null || echo '{}'; }
{
  echo "# Signal snapshot @ $(date -u +%FT%TZ)"
  for expr in \
    'job:http_requests:error_ratio5m{job="health-watchers-api"}' \
    'job:http_request_duration:p99_5m{job="health-watchers-api"}' \
    'sum(rate(http_requests_total{job="health-watchers-api"}[5m]))' \
    'nodejs_eventloop_lag_p99_seconds{job="health-watchers-api"}' \
    'mongodb_pool_wait_queue_size' \
    'job:notification_delivery_failure:ratio15m' ; do
    echo "## $expr"
    q "$expr" | python3 -c 'import sys,json;d=json.load(sys.stdin);[print("  ",r["metric"],r["value"][1]) for r in d.get("data",{}).get("result",[])]' 2>/dev/null || true
  done
} > "$DIR/signals.txt"

# ── 3. Error log tail ───────────────────────────────────────────────────
if command -v kubectl >/dev/null; then
  kubectl -n "$KUBE_NAMESPACE" logs -l app=api --tail=200 --since=15m 2>/dev/null \
    | grep -iE '"level":(50|60)|error|fatal' | tail -80 > "$DIR/error-logs.txt" || true
fi

# ── 4. Seed the incident doc ───────────────────────────────────────────
TEMPLATE="$ROOT/docs/templates/INCIDENT_COMMUNICATION.md"
{
  echo "# Incident: $ALERT"
  echo
  echo "- **ID:** $INCIDENT_ID"
  echo "- **Opened:** $(date -u +%FT%TZ)"
  echo "- **Severity:** $SEVERITY"
  echo "- **Service:** $SERVICE"
  echo "- **Status:** investigating"
  echo "- **Commander:** _unassigned_"
  echo
  echo "## Timeline"
  echo "- $(date -u +%H:%MZ) — alert \`$ALERT\` fired; incident workspace created automatically."
  echo
  echo "## Attached snapshots"
  echo "- \`k8s-snapshot.txt\` — pods, events, rollout"
  echo "- \`signals.txt\` — Prometheus RED + subsystem series"
  echo "- \`error-logs.txt\` — last 15m of API error logs"
  echo
  if [[ -f "$TEMPLATE" ]]; then
    echo "## Communication template"
    echo
    cat "$TEMPLATE"
  fi
} > "$DIR/incident.md"

# ── 5. Notify ──────────────────────────────────────────────────────────
if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
  curl -sf -X POST -H 'Content-Type: application/json' "$SLACK_WEBHOOK_URL" -d @- <<EOF || true
{"text":":rotating_light: *Incident opened* — \`$ALERT\` ($SEVERITY)\nWorkspace: \`docs/incidents/$INCIDENT_ID/\`\nStatus: *investigating*. Snapshots captured (k8s, signals, logs)."}
EOF
  log "Posted investigating update to Slack."
fi

log "Incident workspace ready: $DIR/incident.md"
echo "$DIR"
