#!/usr/bin/env bash
#
# Post-deployment verification and automatic rollback.
#
# Polls the deployed service's health endpoint and error-rate metric
# immediately after a deploy. If the service fails to become healthy, or
# the error rate crosses a critical threshold within the verification
# window, triggers an automatic rollback to the previous known-good
# revision.
#
# Usage:
#   ./scripts/deploy-health-check.sh <service> <previous-revision>
#
# Env vars:
#   HEALTH_URL            Health check URL, default derived from SERVICE
#   VERIFY_WINDOW_SEC      How long to watch post-deploy, default 120
#   POLL_INTERVAL_SEC      Seconds between checks, default 10
#   ERROR_RATE_THRESHOLD   Fraction (0-1) that triggers rollback, default 0.05
#   PROMETHEUS_URL         Prometheus base URL for error-rate queries

set -euo pipefail

SERVICE="${1:?Usage: deploy-health-check.sh <service> <previous-revision>}"
PREVIOUS_REVISION="${2:?Usage: deploy-health-check.sh <service> <previous-revision>}"

HEALTH_URL="${HEALTH_URL:-https://${SERVICE}.healthwatchers.internal/health}"
VERIFY_WINDOW_SEC="${VERIFY_WINDOW_SEC:-120}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-10}"
ERROR_RATE_THRESHOLD="${ERROR_RATE_THRESHOLD:-0.05}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://prometheus:9090}"

log() { echo "[deploy-verify] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

rollback() {
  local reason="$1"
  log "ROLLBACK triggered: ${reason}"
  log "Rolling ${SERVICE} back to revision ${PREVIOUS_REVISION}"
  if command -v kubectl >/dev/null 2>&1; then
    kubectl rollout undo "deployment/${SERVICE}" --to-revision="${PREVIOUS_REVISION}" || true
  else
    log "kubectl not available; emit rollback event for the deploy pipeline to act on"
  fi
  ./scripts/observability/incident-response.sh "deploy-rollback" "${SERVICE}" "${reason}" 2>/dev/null || true
  exit 1
}

check_health() {
  curl -fsS --max-time 5 "${HEALTH_URL}" >/dev/null 2>&1
}

check_error_rate() {
  local query="sum(rate(http_requests_total{job=\"${SERVICE}\",status=~\"5..\"}[2m])) / sum(rate(http_requests_total{job=\"${SERVICE}\"}[2m]))"
  local result
  result=$(curl -fsS --max-time 5 --get "${PROMETHEUS_URL}/api/v1/query" --data-urlencode "query=${query}" \
    | jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "0")
  echo "${result}"
}

log "Starting post-deploy verification for ${SERVICE} (window=${VERIFY_WINDOW_SEC}s)"

elapsed=0
consecutive_failures=0

while [ "${elapsed}" -lt "${VERIFY_WINDOW_SEC}" ]; do
  if ! check_health; then
    consecutive_failures=$((consecutive_failures + 1))
    log "Health check failed (${consecutive_failures} consecutive)"
    if [ "${consecutive_failures}" -ge 3 ]; then
      rollback "health endpoint failing after deploy"
    fi
  else
    consecutive_failures=0
  fi

  error_rate=$(check_error_rate)
  if awk -v er="${error_rate}" -v th="${ERROR_RATE_THRESHOLD}" 'BEGIN { exit !(er > th) }'; then
    rollback "error rate ${error_rate} exceeded threshold ${ERROR_RATE_THRESHOLD}"
  fi

  sleep "${POLL_INTERVAL_SEC}"
  elapsed=$((elapsed + POLL_INTERVAL_SEC))
done

log "Deployment verified healthy for ${SERVICE} after ${VERIFY_WINDOW_SEC}s window"
