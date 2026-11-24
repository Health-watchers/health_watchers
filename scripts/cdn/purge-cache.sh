#!/bin/bash
# scripts/cdn/purge-cache.sh
# CLI wrapper for CDN cache invalidation across providers. Used by the deploy
# pipeline and the DR runbooks. Mirrors POST /api/v1/cdn/cache-invalidation.
#
# Usage:
#   purge-cache.sh --paths "/,/sitemap.xml,/api/v1/icd10*"   [--provider all]
#   purge-cache.sh --all --yes
#   purge-cache.sh --deploy-defaults          # purge only known-mutable paths
#
# Env (any subset): CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN,
#   CLOUDFRONT_DISTRIBUTION_ID, AWS_REGION, FASTLY_SERVICE_ID, FASTLY_API_KEY
# Requires: curl, jq; aws-cli for CloudFront.

set -euo pipefail

PROVIDER="all"
PATHS=""
PURGE_ALL=false
CONFIRM=false
DEPLOY_DEFAULTS=false
DEFAULT_MUTABLE_PATHS="/,/index.html,/sitemap.xml,/robots.txt,/manifest.webmanifest,/api/v1/icd10*,/api/v1/catalog*"

log()     { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
error()   { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ❌ $*" >&2; }
success() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✅ $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --paths)           PATHS="$2"; shift 2 ;;
    --provider)        PROVIDER="$2"; shift 2 ;;
    --all)             PURGE_ALL=true; shift ;;
    --yes)             CONFIRM=true; shift ;;
    --deploy-defaults) DEPLOY_DEFAULTS=true; shift ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) error "unknown arg: $1"; exit 1 ;;
  esac
done

$DEPLOY_DEFAULTS && PATHS="$DEFAULT_MUTABLE_PATHS"
if $PURGE_ALL && ! $CONFIRM; then
  error "--all purges the entire cache; pass --yes to confirm"
  exit 1
fi
[[ -n "$PATHS" || "$PURGE_ALL" == true ]] || { error "give --paths, --deploy-defaults, or --all"; exit 1; }

IFS=',' read -ra PATH_ARR <<< "$PATHS"
RC=0

purge_cloudflare() {
  [[ -n "${CLOUDFLARE_ZONE_ID:-}" && -n "${CLOUDFLARE_API_TOKEN:-}" ]] || { log "cloudflare: not configured, skip"; return 0; }
  local body
  if $PURGE_ALL; then
    body='{"purge_everything":true}'
  else
    local files; files=$(printf '"%s",' "${PATH_ARR[@]}" | sed 's/,$//')
    body="{\"files\":[${files}]}"
  fi
  local resp
  resp=$(curl -sf -X POST \
    "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" --data "$body") || { error "cloudflare: request failed"; return 1; }
  if [[ "$(jq -r '.success' <<<"$resp")" == "true" ]]; then
    success "cloudflare: purged $($PURGE_ALL && echo everything || echo "${#PATH_ARR[@]} path(s)")"
  else
    error "cloudflare: $(jq -c '.errors' <<<"$resp")"; return 1
  fi
}

purge_cloudfront() {
  [[ -n "${CLOUDFRONT_DISTRIBUTION_ID:-}" ]] || { log "cloudfront: not configured, skip"; return 0; }
  command -v aws >/dev/null || { error "cloudfront: aws-cli not found"; return 1; }
  local items ref
  if $PURGE_ALL; then items='["/*"]'; else
    items=$(printf '"%s",' "${PATH_ARR[@]}" | sed 's/,$//'); items="[${items}]"
  fi
  ref="purge-$(date +%s)-$RANDOM"
  local id
  id=$(aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --invalidation-batch "{\"CallerReference\":\"$ref\",\"Paths\":{\"Quantity\":$(wc -w <<<"${PATH_ARR[*]:-/*}"|tr -d ' '),\"Items\":$items}}" \
    --query 'Invalidation.Id' --output text) || { error "cloudfront: create-invalidation failed"; return 1; }
  success "cloudfront: invalidation $id submitted"
}

purge_fastly() {
  [[ -n "${FASTLY_API_KEY:-}" && -n "${FASTLY_SERVICE_ID:-}" ]] || { log "fastly: not configured, skip"; return 0; }
  if $PURGE_ALL; then
    curl -sf -X POST "https://api.fastly.com/service/${FASTLY_SERVICE_ID}/purge_all" \
      -H "Fastly-Key: ${FASTLY_API_KEY}" >/dev/null && success "fastly: purged all" || { error "fastly: purge_all failed"; return 1; }
  else
    for p in "${PATH_ARR[@]}"; do
      curl -sf -X POST "https://api.fastly.com/purge/${p#/}" -H "Fastly-Key: ${FASTLY_API_KEY}" >/dev/null \
        || { error "fastly: purge $p failed"; return 1; }
    done
    success "fastly: purged ${#PATH_ARR[@]} path(s)"
  fi
}

case "$PROVIDER" in
  cloudflare) purge_cloudflare || RC=1 ;;
  cloudfront) purge_cloudfront || RC=1 ;;
  fastly)     purge_fastly     || RC=1 ;;
  all)        purge_cloudflare || RC=1; purge_cloudfront || RC=1; purge_fastly || RC=1 ;;
  *) error "unknown provider: $PROVIDER"; exit 1 ;;
esac

exit $RC
