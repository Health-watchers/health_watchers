#!/usr/bin/env bash
#
# Registry cleanup automation: removes untagged manifests and image tags
# older than a retention window, keeping the registry from growing
# unbounded. Intended to run on a schedule (e.g. weekly CI cron).
#
# Usage:
#   ./scripts/docker-registry-cleanup.sh <service>
#
# Env vars:
#   REGISTRY            Container registry, default ghcr.io/health-watchers
#   RETENTION_DAYS       Delete untagged images older than this, default 14
#   KEEP_LAST_N_TAGGED   Always keep the N most recent tagged images, default 10

set -euo pipefail

SERVICE="${1:?Usage: docker-registry-cleanup.sh <service>}"
REGISTRY="${REGISTRY:-ghcr.io/health-watchers}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
KEEP_LAST_N_TAGGED="${KEEP_LAST_N_TAGGED:-10}"

echo "==> Cleaning up ${REGISTRY}/${SERVICE} (retention=${RETENTION_DAYS}d, keep last ${KEEP_LAST_N_TAGGED} tagged)"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required for registry cleanup" >&2
  exit 1
fi

# List all package versions for the service, oldest first.
VERSIONS_JSON=$(gh api \
  "/orgs/health-watchers/packages/container/${SERVICE}/versions?per_page=100" \
  --paginate 2>/dev/null || echo "[]")

echo "${VERSIONS_JSON}" | jq -r --arg days "${RETENTION_DAYS}" '
  .[] | select(
    (.metadata.container.tags | length) == 0
    and ((now - (.created_at | fromdateiso8601)) > (($days | tonumber) * 86400))
  ) | .id
' | while read -r version_id; do
  [ -z "${version_id}" ] && continue
  echo "Deleting untagged version ${version_id}"
  gh api --method DELETE \
    "/orgs/health-watchers/packages/container/${SERVICE}/versions/${version_id}" \
    || echo "Failed to delete version ${version_id}, continuing"
done

# Keep only the N most recent tagged versions, delete the rest.
echo "${VERSIONS_JSON}" | jq -r --arg n "${KEEP_LAST_N_TAGGED}" '
  [.[] | select((.metadata.container.tags | length) > 0)]
  | sort_by(.created_at) | reverse
  | .[($n | tonumber):] | .[].id
' | while read -r version_id; do
  [ -z "${version_id}" ] && continue
  echo "Pruning old tagged version ${version_id}"
  gh api --method DELETE \
    "/orgs/health-watchers/packages/container/${SERVICE}/versions/${version_id}" \
    || echo "Failed to delete version ${version_id}, continuing"
done

echo "==> Registry cleanup complete for ${SERVICE}"
