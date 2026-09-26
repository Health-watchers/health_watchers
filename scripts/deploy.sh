#!/usr/bin/env bash
# Deploy the built image to the target environment.
# Usage: ./scripts/deploy.sh <environment> <sha>
set -euo pipefail

ENVIRONMENT="${1:?environment required (staging|production)}"
SHA="${2:?commit sha required}"

echo "Deploying ${SHA} to ${ENVIRONMENT}..."

case "${ENVIRONMENT}" in
  staging)
    kubectl config use-context staging-cluster
    ;;
  production)
    kubectl config use-context production-cluster
    ;;
  *)
    echo "Unknown environment: ${ENVIRONMENT}" >&2
    exit 1
    ;;
esac

kubectl set image "deployment/health-watchers" \
  "health-watchers=ghcr.io/${GITHUB_REPOSITORY:-org/health-watchers}:${SHA}" \
  --namespace "${ENVIRONMENT}"

kubectl rollout status "deployment/health-watchers" --namespace "${ENVIRONMENT}" --timeout=5m

echo "Deployment of ${SHA} to ${ENVIRONMENT} complete."
