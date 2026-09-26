#!/usr/bin/env bash
#
# Docker BuildKit CI build script with layer caching, build-time tracking,
# and image size reporting. Complements scripts/docker-build.sh with a
# CI-focused flow: registry cache import/export, timing alerts, and a
# vulnerability scan gate.
#
# Usage:
#   ./scripts/docker-buildkit-ci.sh <service> <image-tag>
#
# Env vars:
#   REGISTRY              Container registry, default ghcr.io/health-watchers
#   BUILD_TIME_BUDGET_SEC  Alert threshold in seconds, default 300 (5 min)
#   SKIP_SCAN              Set to "true" to skip trivy vulnerability scan

set -euo pipefail

SERVICE="${1:?Usage: docker-buildkit-ci.sh <service> <image-tag>}"
TAG="${2:?Usage: docker-buildkit-ci.sh <service> <image-tag>}"
REGISTRY="${REGISTRY:-ghcr.io/health-watchers}"
BUILD_TIME_BUDGET_SEC="${BUILD_TIME_BUDGET_SEC:-300}"
SKIP_SCAN="${SKIP_SCAN:-false}"

IMAGE="${REGISTRY}/${SERVICE}:${TAG}"
CACHE_IMAGE="${REGISTRY}/${SERVICE}:buildcache"
DOCKERFILE="apps/${SERVICE}/Dockerfile.prod"

export DOCKER_BUILDKIT=1

echo "==> Building ${IMAGE} with BuildKit + registry cache"
START_TS=$(date +%s)

docker buildx build \
  --file "${DOCKERFILE}" \
  --tag "${IMAGE}" \
  --cache-from "type=registry,ref=${CACHE_IMAGE}" \
  --cache-to "type=registry,ref=${CACHE_IMAGE},mode=max" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --progress=plain \
  --load \
  "apps/${SERVICE}"

END_TS=$(date +%s)
DURATION=$((END_TS - START_TS))

echo "==> Build completed in ${DURATION}s"
if [ "${DURATION}" -gt "${BUILD_TIME_BUDGET_SEC}" ]; then
  echo "::warning::Docker build for ${SERVICE} took ${DURATION}s, exceeding budget of ${BUILD_TIME_BUDGET_SEC}s"
fi

SIZE=$(docker image inspect "${IMAGE}" --format='{{.Size}}')
SIZE_MB=$((SIZE / 1024 / 1024))
echo "==> Image size: ${SIZE_MB} MB"

if [ "${SKIP_SCAN}" != "true" ]; then
  if command -v trivy >/dev/null 2>&1; then
    echo "==> Scanning ${IMAGE} for vulnerabilities"
    trivy image --severity CRITICAL,HIGH --exit-code 1 "${IMAGE}"
  else
    echo "::warning::trivy not installed, skipping vulnerability scan"
  fi
fi

echo "==> Pushing ${IMAGE}"
docker push "${IMAGE}"

cat <<EOF >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
### Docker build summary: ${SERVICE}
- Image: ${IMAGE}
- Build time: ${DURATION}s (budget ${BUILD_TIME_BUDGET_SEC}s)
- Image size: ${SIZE_MB} MB
EOF
