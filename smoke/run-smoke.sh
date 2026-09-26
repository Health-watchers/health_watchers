#!/usr/bin/env bash
# Orchestrates the Health Watchers smoke test suite.
#
# Usage:
#   smoke/run-smoke.sh                # API smoke only
#   RUN_WEB=1 smoke/run-smoke.sh      # API + Playwright web smoke
#
# Environment:
#   SMOKE_API_URL      Base URL of the API        (default http://localhost:3001)
#   SMOKE_WEB_URL      Base URL of the web app    (default http://localhost:3000)
#   SMOKE_DOCTOR_EMAIL / SMOKE_DOCTOR_PASSWORD   credentials
#   SMOKE_BUDGET_MS    total budget in ms         (default 300000 = 5 min)
#   SMOKE_RETRIES      per-check retries          (default 2)
set -euo pipefail

SMOKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "${SMOKE_DIR}/../apps/web" && pwd)"
REPORTS="${SMOKE_DIR}/reports"
BUDGET_MS="${SMOKE_BUDGET_MS:-300000}"
API_URL="${SMOKE_API_URL:-http://localhost:3001}"
WEB_URL="${SMOKE_WEB_URL:-http://localhost:3000}"
RUN_WEB="${RUN_WEB:-0}"

for arg in "$@"; do
  case "${arg}" in
    --web) RUN_WEB=1 ;;
    *) ;;
  esac
done

mkdir -p "${REPORTS}"
rm -f "${REPORTS}/api-smoke-results.json" "${REPORTS}/web-smoke-results.json"

START_MS=$(date +%s%3N)
status=0

echo "==> API smoke (${API_URL})"
if ! node "${SMOKE_DIR}/api-smoke.js" --base-url="${API_URL}"; then
  status=1
fi

if [[ "${RUN_WEB:-0}" == "1" ]]; then
  echo "==> Web smoke (cross-browser, ${WEB_URL})"
  pushd "${WEB_DIR}" >/dev/null
  if ! PLAYWRIGHT_BASE_URL="${WEB_URL}" npx playwright test --config playwright.smoke.config.ts; then
    status=1
  fi
  popd >/dev/null
fi

ELAPSED_MS=$(( $(date +%s%3N) - START_MS ))
export SMOKE_BUDGET_MS="${BUDGET_MS}"
echo "==> Elapsed ${ELAPSED_MS}ms (budget ${BUDGET_MS}ms)"
if (( ELAPSED_MS > BUDGET_MS )); then
  echo "SMOKE BUDGET EXCEEDED: ${ELAPSED_MS}ms > ${BUDGET_MS}ms" >&2
  status=1
fi

echo "==> Generating report"
if ! node "${SMOKE_DIR}/report.js"; then
  status=1
fi

if (( status == 0 )); then
  echo "Smoke suite PASSED"
else
  echo "Smoke suite FAILED" >&2
fi
exit "${status}"