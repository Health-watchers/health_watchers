# CI/CD Pipeline Documentation

This document provides comprehensive information about the Health Watchers CI/CD pipeline.

## Overview

The CI/CD pipeline is built with GitHub Actions and provides:

1. **Continuous Integration**: Automated testing, building, and quality checks
2. **Security Scanning**: Vulnerability detection and compliance validation
3. **Container Building**: Docker image creation with security scanning
4. **Continuous Deployment**: Automated deployment to staging and production environments
5. **Notifications**: Real-time alerts via Slack and email

## Pipeline Stages

### Stage 0: Workflow Validation

**Workflow**: `workflow-validation.yml` (name: `Workflow Validation`)
- Validates workflow file syntax
- Checks for deprecated actions
- Ensures workflow correctness

### Stage 1: Quality Checks (Parallel)

**Job**: `quality-checks` (in `ci.yml`)

Runs in parallel:
- **TypeScript**: Type checking across all workspaces
- **Linting**: ESLint with zero-warning policy
- **Formatting**: Prettier code format validation
- **Translations**: i18n translation key validation
- **Kubernetes**: Manifest schema validation with kubeconform

### Stage 2: Security Scanning (Parallel)

**Workflow**: `security-scan` (name: `Security Scanning (PR)`); scheduled deep scans run in `security-scheduled.yml`

Runs in parallel:
- **npm audit**: Critical vulnerability detection
- **License checker**: Dependency license compliance
- **Snyk**: Advanced vulnerability scanning

### Stage 3: Testing

**Job**: `test` (in `ci.yml`)

Executes:
- Unit tests for API service
- Integration tests for API service
- Security headers validation
- Coverage report generation
- Upload to Codecov

### Stage 4: Build

**Job**: `build` (in `ci.yml`)

Builds:
- API application
- Web frontend
- Stellar service
- Artifacts cached for deployment

### Docker Build & Push

**Job**: `docker-build` (in `ci.yml`)

For each service (API, Stellar Service):
1. **Build**: Multi-stage Docker build with BuildKit
2. **Push**: Push to GitHub Container Registry (on main branch)
3. **Security Scanning**: Trivy vulnerability scan
4. **SBOM Generation**: Software Bill of Materials creation

### Stage 5: E2E Tests

**Job**: `e2e` (in `ci.yml`)

End-to-end testing:
- Playwright browser tests
- Test data seeding
- Full stack integration testing
- Video recording on failure
- Report generation

### Stage 6: Deployment

**Workflow**: `deploy` (name: `Deployment Pipeline`)

Manual deployment workflow:
- **Staging**: Automatic after CI passes
- **Production**: Manual approval required

## Workflow Inventory

Every workflow in `.github/workflows/` is listed below with its trigger, purpose and owner. Each workflow has a unique `name:` so the Actions UI and README badges are unambiguous.

| File | `name:` | Trigger | Purpose | Owner |
| --- | --- | --- | --- | --- |
| `ci.yml` | CI | `push` / `pull_request` to `main`, `develop` | **The only PR-gating CI workflow.** Quality checks, tests, build, E2E and Docker build/scan as jobs. | Platform team |
| `deploy.yml` | Deployment Pipeline | `workflow_dispatch` | Deploy to staging/production with approval gates. | Platform team |
| `notifications.yml` | Notifications | `workflow_run` | Slack and email notifications for workflow outcomes. | Platform team |
| `security-scan.yml` | Security Scanning (PR) | `pull_request` to `main`, `develop` | PR-gating security checks: npm audit, license compliance, Snyk. | Security team |
| `security-scheduled.yml` | Security Scanning (Scheduled) | `schedule` (daily), `workflow_dispatch` | Scheduled deep scans: dependency audit, secrets scanning, vulnerability tracking, Dependabot security review. | Security team |
| `performance.yml` | Performance Tests | `schedule` (weekly), `workflow_dispatch`, `pull_request` on perf paths | Single performance workflow with separate `load`, `stress` and `benchmark` jobs. | Performance team |
| `workflow-validation.yml` | Workflow Validation | `pull_request` on `.github/**` | Lints workflow files and validates syntax. | Platform team |

### Consolidation Notes

The following workflows were merged and removed:

- **`ci.yml` + `ci-cd.yml`** → single `ci.yml` (name: `CI`). `ci-cd.yml` duplicated the same triggers and display name; its jobs now live in `ci.yml`.
- **`security-scan.yml` + `security-scanning.yml`** → `security-scan.yml` (name: `Security Scanning (PR)`). `security-audit.yml`, `secrets-scanning.yml`, `dependency-scan.yml`, `dependency-vulnerability-tracking.yml` and `dependabot-security.yml` were folded into `security-scheduled.yml` (name: `Security Scanning (Scheduled)`).
- **`performance.yml` + `performance-tests.yml` + `performance-benchmarks.yml`** → `performance.yml` (name: `Performance Tests`) with `load`, `stress` and `benchmark` jobs.

Shared setup (checkout, Node, npm cache, install) lives in the composite action `.github/actions/setup` and is used by every workflow above.

### Actions Minutes per PR

Measured on a representative PR (median of 5 runs) before and after consolidation:

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Workflow runs per PR | 9 | 3 | −6 |
| Actions minutes per PR | ~118 min | ~46 min | **−61%** |
| Duplicate failure reports | 3–4 per failure | 1 | — |

The three remaining PR runs are `CI`, `Security Scanning (PR)` and (when perf paths change) `Performance Tests`.

## Triggering Workflows

### Continuous Integration (CI)

Triggered automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

### Docker Build

Triggered automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Changes to Docker-related files

### Deployment

Triggered manually via:
```bash
gh workflow run deploy.yml -f environment=staging
gh workflow run deploy.yml -f environment=production
```

Or through GitHub UI: Actions → Deployment Pipeline → Run workflow

## Environment Configuration

### Required Secrets

Add these secrets in GitHub repository settings:

**Docker & Registry**:
- `DOCKER_USERNAME`: Docker Hub username
- `DOCKER_PASSWORD`: Docker Hub password

**Kubernetes**:
- `KUBE_CONFIG_STAGING`: Base64-encoded kubeconfig for staging
- `KUBE_CONFIG_PRODUCTION`: Base64-encoded kubeconfig for production

**Notifications**:
- `SLACK_WEBHOOK_URL`: Slack webhook for notifications
- `SMTP_SERVER`: SMTP server address
- `SMTP_PORT`: SMTP port (usually 587)
- `SMTP_USERNAME`: SMTP authentication username
- `SMTP_PASSWORD`: SMTP authentication password
- `NOTIFICATION_EMAIL`: Email for failure notifications

**Testing**:
- `CODECOV_TOKEN`: Codecov integration token
- `SNYK_TOKEN`: Snyk security scanning token
- `E2E_DOCTOR_EMAIL`: Test doctor account email
- `E2E_DOCTOR_PASSWORD`: Test doctor account password
- `E2E_ADMIN_EMAIL`: Test admin account email
- `E2E_ADMIN_PASSWORD`: Test admin account password

**AWS (OIDC)**:
- `AWS_ROLE_ARN`: ARN of the IAM role assumed via GitHub OIDC (no long-lived keys)
- `AWS_REGION`: AWS region (repository variable, defaults to `us-east-1`)

### Scheduled Workflows: Required Secrets & Variables

Scheduled workflows must never fail at `Set up job`. Each one starts with a
guard job that checks its required secrets (via an `env` indirection, since
`secrets` cannot be referenced directly in `if:`) and skips with an explanatory
summary when they are missing.

| Workflow | File | Required secrets | Required variables | Notes |
|----------|------|------------------|--------------------|-------|
| Code Quality | `code-quality.yml` | none | none | Runs on `ubuntu-latest`; no external credentials |
| Performance Benchmarks | `performance-benchmarks.yml` | none | none | Skips benchmark comparison when no baseline artifact exists |
| CDN Cache Report | `cdn-cache.yml` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` | none | **Disabled** until CDN infrastructure exists |
| Cost Report | `cost-report.yml` | `AWS_ROLE_ARN` | `AWS_REGION` | **Disabled** until cost/billing infrastructure exists |
| Secrets Scanning (Gitleaks) | `secrets-scanning.yml` | none | none | Uses the pinned Gitleaks action; no token required |
| Backup Verification | `backup-verify.yml` | `STAGING_MONGODB_URI` | none | Skips when no recent backup is found |
| Secrets Rotation Check | `secrets-rotation-check.yml` | `AWS_ROLE_ARN` | `AWS_REGION` | Uses OIDC; checks staging and production roles |
| MongoDB Backup | `backup.yml` | `SLACK_WEBHOOK_URL` (failure notification) | none | Backups run from `k8s/backup/` CronJobs; Actions verifies only |

### AWS Authentication via OIDC

AWS-authenticated workflows (Cost Report, Secrets Rotation Check, and any
deployment job that needs AWS) use GitHub's OIDC provider instead of
long-lived access keys:

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
      aws-region: ${{ vars.AWS_REGION || 'us-east-1' }}
```

The IAM role's trust policy must allow
`token.actions.githubusercontent.com` with the repository and branch
(`repo:health-watchers/health-watchers:ref:refs/heads/main`) as the subject.
No `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` secrets should exist.

### Disabled Workflows

The following workflows are disabled (via `if: false` on their jobs or by
removing the `schedule` trigger) until the infrastructure they depend on
exists. Re-enable them once the corresponding secrets and infrastructure are
provisioned:

- **CDN Cache weekly report** — no CDN in front of the app yet
- **Cost Report** — no AWS billing export / cost allocation tags yet

### Seed Data (Local & E2E Only)

`npm run seed` (alias for `npm run seed --workspace=api`) populates a fresh
database with synthetic data using Faker with a fixed seed. It is idempotent
and refuses to run when `NODE_ENV=production`.

Seeded credentials — **local development and E2E only, never production**:

| Role | Email | Password |
|------|-------|----------|
| SUPER_ADMIN | `superadmin@example.test` | `SeedPassword123!` |
| CLINIC_ADMIN | `clinicadmin@example.test` | `SeedPassword123!` |
| DOCTOR | `doctor@example.test` | `SeedPassword123!` |
| NURSE | `nurse@example.test` | `SeedPassword123!` |
| ASSISTANT | `assistant@example.test` | `SeedPassword123!` |
| READ_ONLY | `readonly@example.test` | `SeedPassword123!` |

The E2E and preview workflows call `npm run seed` without a fallback, so a
broken seed fails the job instead of silently running against an empty
database.

### Environment Variables

Set in workflow files or repository settings:

```env
NODE_VERSION=20
REGISTRY=ghcr.io
IMAGE_PREFIX=health-watchers
STELLAR_NETWORK=mainnet
```

## Quality Gates

### CI Pipeline Gates

1. ✅ **Workflow validation** - Must pass
2. ✅ **Type checking** - Must pass
3. ✅ **Linting** - Must pass (zero warnings)
4. ✅ **Code format** - Must pass
5. ✅ **K8s validation** - Must pass
6. ✅ **Critical vulnerabilities** - Must pass (fail-on-critical)
7. ✅ **Unit/integration tests** - Must pass
8. ✅ **Build** - Must pass

### Security Gates

1. ⚠️ **npm audit critical** - Blocks merge
2. ⚠️ **npm audit high** - Warns (non-blocking)
3. ⚠️ **License compliance** - Warns (non-blocking)
4. ⚠️ **Snyk scan** - Warns (non-blocking)

### Deployment Gates

1. ✅ **All CI tests passed** - Required
2. ✅ **Docker images built** - Required
3. ✅ **E2E tests passed** - Required
4. ✅ **Staging deployment successful** - Required for production
5. ✅ **Manual approval** - Required for production

## Docker Image Building

### Image Naming Convention

```
ghcr.io/health-watchers/health-watchers-{service}:{tag}
```

Examples:
- `ghcr.io/health-watchers/health-watchers-api:latest`
- `ghcr.io/health-watchers/health-watchers-api:main-a1b2c3d`
- `ghcr.io/health-watchers/health-watchers-api:v1.2.0`

### Image Tags

Automatically generated tags:
- `latest` - Latest on default branch
- `main-{sha}` - Main branch short SHA
- `develop-{sha}` - Develop branch short SHA
- `v{version}` - Semantic version tags

### Security Scanning

Each image is scanned with:
- **Trivy**: High/Critical vulnerabilities
- **SBOM**: Software Bill of Materials in CycloneDX format

Results:
- Available in GitHub Security tab
- SBOM artifacts stored for 30 days

## Deployment Process

### Staging Deployment

Automatic deployment after CI passes on main branch:

1. **Validate** manifests and deployment
2. **Update** images in Kubernetes
3. **Rollout** with status monitoring
4. **Verify** health checks and endpoints
5. **Test** with smoke tests

### Production Deployment

Manual deployment with approval:

1. **Validate** manifests and deployment
2. **Create** backup of data
3. **Update** images in Kubernetes (blue-green)
4. **Monitor** rollout and health checks
5. **Smoke test** all endpoints
6. **Rollback** if deployment fails

Rollback happens automatically on failure.

## Monitoring & Notifications

### Slack Notifications

Send alerts for:
- ✅ Workflow success
- ❌ Workflow failure
- 🚀 Deployment started/completed

Configure webhook in GitHub secrets.

### Email Notifications

Send emails on:
- ❌ Workflow failure
- Deploy success

Configure SMTP in GitHub secrets.

### GitHub Status Checks

Status checks visible on:
- Pull requests
- Commit details
- Deployment status page

## Troubleshooting

### CI Pipeline Failures

#### Type checking failed
```bash
npm run typecheck
```

#### Linting failed
```bash
npm run lint
npm run lint -- --fix  # Auto-fix
```

#### Formatting failed
```bash
npm run format:check
npm run format        # Auto-format
```

#### Tests failed
```bash
npm test
npm run test:watch   # Interactive mode
```

#### Build failed
```bash
npm run build
```

### Docker Build Failures

#### Build cache issues
- Clear cache: `.docker-cache/`
- Re-run: Should trigger fresh build

#### Image size issues
- Review Dockerfile layers
- Check `.dockerignore` entries
- Verify multi-stage build structure

#### Scanning failures
- Trivy scan warnings are non-blocking
- Review identified vulnerabilities
- Update dependencies if critical

### Deployment Failures

#### kubectl authentication failed
- Verify kubeconfig secret is set
- Check cluster connectivity
- Validate RBAC permissions

#### Rollout timeout
- Check pod status: `kubectl describe pod <name>`
- Review pod logs: `kubectl logs <name>`
- Increase timeout if needed

#### Health check failures
- Verify endpoint is responding
- Check service connectivity
- Review application logs

## Performance Optimization

### Build Caching

#### Docker BuildKit Cache
- Enabled by default
- Uses GitHub Actions cache
- Significantly speeds up rebuilds

#### Turbo Cache
- Caches build outputs
- Shared across workflows
- Reduces build time by 50-70%

### Parallel Execution

Jobs run in parallel where possible:
- Quality checks (type, lint, format)
- Security scanning
- E2E testing

### Artifact Management

- Build artifacts retained for 7 days
- Test reports retained for 7 days
- SBOMs retained for 30 days
- Playright reports retained for 7 days

## Best Practices

1. **Commit Messages**: Follow conventional commits
   - `feat:` for features
   - `fix:` for bug fixes
   - `test:` for test changes
   - `docs:` for documentation

2. **Branch Naming**: Use descriptive names
   - `feature/description`
   - `fix/issue-number`
   - `devops/improvement`

3. **Pull Requests**: Link related issues
   - Title: Clear, descriptive
   - Description: Explain changes
   - Reviewers: Assign for feedback

4. **Commit Size**: Keep commits focused
   - One logical change per commit
   - Easier to review and debug
   - Helps with bisecting issues

5. **Testing**: Write before committing
   - Unit tests for logic changes
   - Integration tests for features
   - E2E tests for user flows

## CI/CD Statistics

### Average Job Duration

- Quality checks: 2-3 minutes
- Security scanning: 3-4 minutes
- Tests: 5-8 minutes
- Build: 3-4 minutes
- Docker build: 4-6 minutes
- E2E tests: 10-15 minutes
- **Total**: ~30-45 minutes

### Success Rate

- Production: >95% (human intervention rare)
- Staging: >98% (auto-recovery on failure)
- PR checks: >90% (caught by linting/tests)

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Build Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Kubernetes Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)
- [Security Scanning Tools](https://github.com/aquasecurity/trivy)
