#!/usr/bin/env bash
# Roll back a failed deployment to the last known-good revision.
# Usage: ./scripts/rollback.sh <sha>
set -euo pipefail

SHA="${1:?commit sha required}"

for ENVIRONMENT in staging production; do
  echo "Checking rollout status for ${ENVIRONMENT}..."
  if ! kubectl rollout status "deployment/health-watchers" --namespace "${ENVIRONMENT}" --timeout=1s >/dev/null 2>&1; then
    echo "Rolling back ${ENVIRONMENT} deployment (failed sha: ${SHA})"
    kubectl rollout undo "deployment/health-watchers" --namespace "${ENVIRONMENT}"
    kubectl rollout status "deployment/health-watchers" --namespace "${ENVIRONMENT}" --timeout=5m
  fi
done

echo "Rollback complete for failed deployment ${SHA}."
