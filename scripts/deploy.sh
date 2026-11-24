#!/usr/bin/env bash
# Deploy the built image to the target environment.
# Usage: ./scripts/deploy.sh <environment> <sha>
set -euo pipefail

ENVIRONMENT="${1:?environment required (staging|production)}"
SHA="${2:?commit sha required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# --- CDN cache invalidation & smoke check -------------------------------------
# Skip gracefully when no CDN is configured for this environment.
if [[ -z "${CLOUDFRONT_DISTRIBUTION_ID:-}" ]]; then
  echo "No CDN configured (CLOUDFRONT_DISTRIBUTION_ID unset); skipping cache invalidation."
else
  echo "Invalidating CDN cache for distribution ${CLOUDFRONT_DISTRIBUTION_ID}..."

  if ! "${SCRIPT_DIR}/cdn/purge-cache.sh" --deploy-defaults; then
    echo "ERROR: CDN cache invalidation failed for distribution ${CLOUDFRONT_DISTRIBUTION_ID}." >&2
    echo "The deployment of ${SHA} to ${ENVIRONMENT} is considered FAILED because stale" >&2
    echo "static assets may be served. Re-run invalidation manually with:" >&2
    echo "  scripts/cdn/purge-cache.sh --paths \"/_next/static/*,/\"" >&2
    exit 1
  fi

  echo "CDN cache invalidation complete."
fi

# Post-deploy smoke check: verify long-lived Cache-Control headers on static assets.
if [[ -z "${CDN_BASE_URL:-}" ]]; then
  echo "No CDN base URL configured (CDN_BASE_URL unset); skipping cache header verification."
else
  echo "Verifying CDN cache headers against ${CDN_BASE_URL}..."

  if ! "${SCRIPT_DIR}/cdn/verify-cache-headers.sh" --base "${CDN_BASE_URL}"; then
    echo "ERROR: CDN cache header verification failed for ${CDN_BASE_URL}." >&2
    echo "Static assets under /_next/static/ are not being served with the expected" >&2
    echo "long-lived Cache-Control headers. Check the CDN configuration." >&2
    exit 1
  fi

  echo "CDN cache header verification passed."
fi

echo "Deployment of ${SHA} to ${ENVIRONMENT} finished successfully."