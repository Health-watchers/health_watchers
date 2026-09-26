# Docker Build Optimization

Complements the existing `scripts/docker-build.sh` and
`docs/DOCKER_OPTIMIZATION.md` with CI-focused tooling for faster,
smaller, and cleaner Docker builds.

## What was added

- **`docker/base/Dockerfile.base`** — shared base image with common
  Node.js build tooling (pnpm, typescript, turbo) so per-service builds
  don't reinstall shared dependencies on every run.
- **`scripts/docker-buildkit-ci.sh`** — CI build script that:
  - Enables BuildKit and uses `buildx` with registry-backed layer caching
    (`--cache-from`/`--cache-to`) so unchanged layers aren't rebuilt.
  - Tracks build duration and emits a GitHub Actions warning if a build
    exceeds the 5-minute budget.
  - Reports final image size to the job summary.
  - Runs a Trivy vulnerability scan (CRITICAL/HIGH) before pushing, failing
    the build on unresolved findings.
- **`scripts/docker-registry-cleanup.sh`** — registry cleanup automation
  that deletes untagged manifests older than a retention window and prunes
  old tagged versions beyond a configurable "keep last N" count.

## Image tagging strategy

- `latest` — most recent successful build of `main`.
- `<git-sha>` — immutable, always pushed, used for deployments/rollback.
- `<semver>` (e.g. `v1.4.2`) — pushed on release tags only.
- `pr-<number>` — ephemeral, built for PR preview environments and cleaned
  up by `docker-registry-cleanup.sh` after merge/close.

## Pull-through caching

For local development and self-hosted CI runners, configure Docker to use
a pull-through cache mirror to avoid repeated pulls from the upstream
registry:

```json
// /etc/docker/daemon.json
{
  "registry-mirrors": ["https://mirror.gcr.io"]
}
```

## Acceptance criteria mapping

| Criterion | Where |
|---|---|
| Builds complete in <5 minutes | `BUILD_TIME_BUDGET_SEC` alert in `docker-buildkit-ci.sh` |
| Image sizes optimized | Alpine + multi-stage base image, size reported in job summary |
| Caching reduces rebuild time | `--cache-from`/`--cache-to` registry cache in `docker-buildkit-ci.sh` |
| Registry stays clean | `docker-registry-cleanup.sh` retention + pruning |
