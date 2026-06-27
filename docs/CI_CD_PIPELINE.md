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

**Workflow**: GitHub Actions linting
- Validates workflow file syntax
- Checks for deprecated actions
- Ensures workflow correctness

### Stage 1: Quality Checks (Parallel)

**Workflow**: `quality-checks`

Runs in parallel:
- **TypeScript**: Type checking across all workspaces
- **Linting**: ESLint with zero-warning policy
- **Formatting**: Prettier code format validation
- **Translations**: i18n translation key validation
- **Kubernetes**: Manifest schema validation with kubeconform

### Stage 2: Security Scanning (Parallel)

**Workflow**: `security-scan`

Runs in parallel:
- **npm audit**: Critical vulnerability detection
- **License checker**: Dependency license compliance
- **Snyk**: Advanced vulnerability scanning

### Stage 3: Testing

**Workflow**: `test`

Executes:
- Unit tests for API service
- Integration tests for API service
- Security headers validation
- Coverage report generation
- Upload to Codecov

### Stage 4: Build

**Workflow**: `build`

Builds:
- API application
- Web frontend
- Stellar service
- Artifacts cached for deployment

### Docker Build & Push

**Workflow**: `docker-build`

For each service (API, Stellar Service):
1. **Build**: Multi-stage Docker build with BuildKit
2. **Push**: Push to GitHub Container Registry (on main branch)
3. **Security Scanning**: Trivy vulnerability scan
4. **SBOM Generation**: Software Bill of Materials creation

### Stage 5: E2E Tests

**Workflow**: `e2e`

End-to-end testing:
- Playwright browser tests
- Test data seeding
- Full stack integration testing
- Video recording on failure
- Report generation

### Stage 6: Deployment

**Workflow**: `deploy`

Manual deployment workflow:
- **Staging**: Automatic after CI passes
- **Production**: Manual approval required

## Workflow Files

```
.github/workflows/
├── ci.yml                    # Main CI pipeline
├── docker-build.yml          # Docker image building and scanning
├── deploy.yml               # Deployment to staging/production
└── notifications.yml        # Slack and email notifications
```

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
