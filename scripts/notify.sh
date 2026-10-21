#!/usr/bin/env bash
# Send a deployment notification to the configured webhook.
# Usage: ./scripts/notify.sh "<message>"
set -euo pipefail

MESSAGE="${1:?message required}"

if [[ -n "${DEPLOY_NOTIFY_WEBHOOK:-}" ]]; then
  curl -sf -X POST "${DEPLOY_NOTIFY_WEBHOOK}" \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"${MESSAGE}\"}"
else
  echo "NOTIFY: ${MESSAGE}"
fi
