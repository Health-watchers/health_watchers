# ADR-004: Deployment Strategy

## Status

Accepted

## Date

2024-03-01

## Context

The platform consists of three runnable services (API, Web, Stellar Service) plus backing services (MongoDB, Redis). Deployments must:

- Be fully automated — no manual SSH steps
- Support zero-downtime releases to avoid disrupting active clinic sessions
- Be identical between staging and production to eliminate "works on staging" issues
- Allow rapid rollback if a release introduces a regression
- Pass security and quality gates before reaching production

## Decision

### Container-first with Docker

Every service is packaged as a Docker image using multi-stage builds:

1. **Build stage** — TypeScript compilation and asset bundling
2. **Production stage** — minimal Node.js Alpine image containing only compiled output and `node_modules` (no dev dependencies, no source TypeScript)

Images are built and pushed to a container registry in the `build` stage of the CI pipeline. Image tags are the Git SHA for traceability.

### Kubernetes as the orchestration platform

All services run in a dedicated `health-watchers` Kubernetes namespace. Each service has:

- `Deployment` — rolling update strategy, configurable replica count
- `Service` — ClusterIP for internal traffic, LoadBalancer/Ingress for external
- `HorizontalPodAutoscaler` — scales on CPU utilisation (target 70 %)
- `PodDisruptionBudget` — guarantees `minAvailable: 1` during voluntary disruptions
- `ConfigMap` / `Secret` — environment-specific configuration, never baked into images

Kubernetes manifests are validated in CI with `kubeconform --strict` before every merge. PDB presence is also asserted in CI (see `.github/workflows/ci.yml`).

### Helm for environment promotion

A Helm chart (`helm/health-watchers/`) wraps the raw manifests and provides:

- Per-environment `values.yaml` (staging vs production)
- Templated image tags so the same chart is used for every deployment
- Atomic upgrades with `helm upgrade --atomic --timeout 5m`

### Blue-Green deployment for production

Production releases use a blue-green strategy:

1. Deploy new version to the **green** environment (idle slot)
2. Run smoke tests against the green environment
3. Switch the Ingress `activeSlot` label to point traffic at green
4. Keep blue running for 10 minutes to allow instant rollback
5. Decommission blue after the rollback window

This gives a sub-second traffic cutover and a clean rollback path without requiring pods to drain slowly.

### CI/CD pipeline (GitHub Actions)

Seven sequential stages gate every merge to `main` or `develop`:

| Stage | Jobs | Blocks on failure |
|-------|------|------------------|
| 0 | `actionlint` — workflow file linting | Yes |
| 1 | `quality-checks` (typecheck, lint, format), `validate-k8s` | Yes |
| 2 | `security-scan` (npm audit, Snyk, licence check) | Yes (critical vulns) |
| 3 | `test` (unit + integration, coverage upload) | Yes |
| 4 | `build` (Docker images for api, web, stellar-service) | Yes |
| 5 | `e2e` (Playwright against the built image) | Yes |
| 6 | `deploy-staging` → `deploy-production` | Production requires manual approval |

### Environment parity

- Local development uses `docker-compose` with the same images, MongoDB replica set, and Redis as production.
- Staging is a full Kubernetes cluster running the same Helm chart as production, with test data.

## Consequences

### Positive

- Multi-stage Docker builds reduce image sizes by ~60 % (no TypeScript compiler, no dev deps).
- `kubeconform` and PDB assertions in CI prevent broken or unsafe manifests from reaching the cluster.
- Blue-green makes production rollback a matter of flipping a label, not re-deploying.
- Identical docker-compose ↔ Kubernetes images eliminate environment-specific bugs.

### Negative / Trade-offs

- Blue-green doubles resource consumption during the cutover window (~10 min).
- Helm adds a templating layer that can be confusing for engineers unfamiliar with Go templates.
- The seven-stage pipeline takes ~15–20 min for a full run; hot-fixes may feel slow.

### Neutral

- Docker image tags tied to Git SHA make every deployed version fully traceable back to a commit.
- Slack notifications on deployment success/failure are handled by the `notifications` workflow.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Rolling update (no blue-green) | Slower rollback; partial traffic to old and new version simultaneously complicates troubleshooting |
| Canary releases | Adds significant complexity (traffic splitting, metrics comparison); blue-green is simpler and meets current risk tolerance |
| AWS ECS / App Runner | Vendor lock-in; Kubernetes is cloud-agnostic and the team has Kubernetes expertise |
| Raw Kubernetes manifests (no Helm) | Duplicating manifests for staging/production is error-prone; Helm templating is worth the overhead |

## References

- `apps/api/Dockerfile` — multi-stage build definition
- `apps/api/Dockerfile.prod` — optimised production variant
- `.github/workflows/ci.yml` — full CI/CD pipeline definition
- `.github/workflows/deploy.yml` — deployment workflow
- `k8s/` — Kubernetes manifests
- `docs/KUBERNETES_DEPLOYMENT.md`
- `docs/HELM_DEPLOYMENT.md`
- `docs/BLUE_GREEN_DEPLOYMENT.md`
