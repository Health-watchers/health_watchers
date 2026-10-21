# Branch Protection Rules

**Issue #1586**: Documentation of branch protection rules for Health Watchers repository.

This document describes the automated requirements that must be satisfied before pull requests can be merged to protected branches.

---

## Protected Branches

The following branches are protected:
- **main** - Production-ready code
- **develop** - Integration and staging code

---

## Required Status Checks (main branch)

All pull requests to `main` must pass the following status checks before merging:

### Continuous Integration (CI)
- ✅ **actionlint** - Validates GitHub Actions workflow syntax
- ✅ **quality-checks** - TypeScript type checking, ESLint, Prettier formatting
- ✅ **validate-k8s** - Kubernetes manifest validation
- ✅ **helm-lint-dry-run** - Helm chart linting and dry-run validation (Issue #1585)
- ✅ **migration-check** - Database migration validation (Issue #1583)
- ✅ **tests** - Unit, integration, and end-to-end test suites
- ✅ **build** - Docker image build and scan for vulnerabilities
- ✅ **postman-sync** - API collection validation and Postman workspace publishing (Issue #1584)

### Code Quality & Security
- ✅ **sonarcloud** - Code quality and security analysis
- ✅ **dependency-scan** - Dependency vulnerability scanning
- ✅ **security-scanning** - Repository secret detection
- ✅ **code-quality** - Additional linting and analysis

### Compliance & Documentation
- ✅ **commitlint** - Validates commit messages follow conventional commits

### Breaking Changes
- ✅ **api-breaking-changes** - Detects breaking changes in API contracts

---

## Required Reviewers

Pull requests to `main` require approval from code owners as defined in `.github/CODEOWNERS`:

- **api/** → `@api-maintainers`
- **apps/web/** → `@frontend-maintainers`
- **apps/stellar-service/** → `@stellar-maintainers`
- **helm/** → `@devops-maintainers`
- **scripts/migrations/** → `@database-maintainers`

See `.github/CODEOWNERS` for the complete list of maintainers and code ownership rules.

---

## Pull Request Requirement: GitHub Issue Reference

All pull requests must reference a related GitHub issue. This is enforced via a GitHub Actions workflow that checks PR descriptions for issue numbers in the format `#XXXX` or `closes #XXXX`.

### Valid Examples
```
Fixes #1234 - Add new feature
Resolves #1234, #1235 - Feature with related issues
```

### Invalid Examples
```
Add new feature  ← No issue reference
Fix bug         ← No issue reference
PR to main      ← No issue reference
```

**Enforcement**: The `issue-reference-check` workflow runs on all pull requests and will fail if no issue is found.

---

## Commit Message Requirements

All commits in pull requests to `main` must follow the **Conventional Commits** specification as enforced by commitlint.

### Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- **feat** - A new feature
- **fix** - A bug fix
- **refactor** - Code change that neither fixes a bug nor adds a feature
- **perf** - Code change that improves performance
- **test** - Adding or updating tests
- **docs** - Documentation only changes
- **chore** - Changes to build process, dependencies, or tooling
- **ci** - Changes to CI/CD configuration
- **style** - Changes that do not affect code meaning (whitespace, formatting)

### Examples
```
feat(auth): add OAuth2 support for Google
fix(api): resolve race condition in payment processing
refactor(database): simplify query builder
docs: update README with deployment guide
```

**Configuration**: Commitlint rules are defined in `commitlintrc.json`. See `.commitlintrc.json` for full configuration.

---

## Database Migration Checks

All database migration files in `scripts/migrations/` are validated to ensure:

1. ✅ **Up & Down functions exist** - Every migration must have both up() and down() functions
2. ✅ **Idempotency** - Migrations must be safely re-runnable (use CREATE TABLE IF NOT EXISTS)
3. ✅ **Named migrations** - All migration files follow the naming convention: `YYYYMMDD-HHMMSS-description.js`
4. ✅ **Status check** - `npm run migrate:status` returns zero (no pending or failed migrations)

**CI Job**: The `migration-check` GitHub Actions job validates migrations on every push and PR (Issue #1583).

---

## Helm Chart Validation

All changes to `helm/health-watchers/` trigger the `helm-lint-dry-run` job which:

1. ✅ **Lints the chart** - `helm lint` validates Helm syntax
2. ✅ **Validates templates** - `helm template` renders all templates
3. ✅ **Dry-run deployment** - `helm upgrade --dry-run` on a kind cluster
4. ✅ **YAML validation** - `kubectl apply --dry-run=server` validates generated manifests

**Triggers**: Changes to:
- `helm/**` - Any Helm chart files
- `.github/workflows/ci.yml` - CI workflow changes

**CI Job**: The `helm-lint-dry-run` GitHub Actions job validates Helm charts (Issue #1585).

---

## Postman Collection Validation

The Postman collection at `docs/postman/health-watchers.postman_collection.json` is:

1. ✅ **Regenerated** - `npm run postman:generate` creates/updates the collection
2. ✅ **Validated** - Collection structure is validated against OpenAPI spec
3. ✅ **Coverage checked** - All required API endpoints are present in the collection
4. ✅ **Published** - On merges to `main`, collection is published to the Postman workspace

**Configuration**: Requires the following repository secrets:
- `POSTMAN_API_KEY` - API key for Postman workspace
- `POSTMAN_COLLECTION_UID` - UID of the collection to update

**CI Job**: The `postman-sync` GitHub Actions job validates and publishes Postman collections (Issue #1584).

See [Postman Collection Setup](#postman-collection-setup) for secrets configuration.

---

## How to Configure

### Setting Repository Secrets

To enable Postman collection publishing and other secret-dependent features:

1. Navigate to repository settings: **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add the following secrets:

| Secret Name | Value | Source |
|---|---|---|
| `POSTMAN_API_KEY` | [Your Postman API Key](https://www.postman.com/settings/me/api-keys) | Postman Settings → API Keys |
| `POSTMAN_COLLECTION_UID` | Your Postman Collection UID | Postman App → Collection Settings |
| `TURBO_TOKEN` | Turbo Remote Cache token (optional) | [Vercel Dashboard](https://vercel.com/account/projects) |
| `TURBO_TEAM` | Turbo team name (optional) | Vercel Dashboard |
| `KUBE_CONFIG_STAGING` | Base64-encoded kubeconfig (optional) | `cat ~/.kube/config \| base64` |
| `KUBE_CONFIG_PRODUCTION` | Base64-encoded kubeconfig (optional) | `cat ~/.kube/config \| base64` |

### Enabling Branch Protection

To enable branch protection rules:

1. Go to **Settings** → **Branches** → **Add rule**
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - ✅ Require code reviews before merging (dismiss stale review on push)
   - ✅ Require review from code owners
   - ✅ Restrict who can push to matching branches (admin only)

### GitHub Actions Status Checks

Status checks are automatically added to branch protection once they run successfully. To require a specific check:

1. Go to **Settings** → **Branches** → Edit rule
2. Under "Require status checks to pass before merging", search for and select checks:
   - `actionlint`
   - `quality-checks`
   - `validate-k8s`
   - `helm-lint-dry-run`
   - `migration-check`
   - `tests`
   - `build`
   - `postman-sync`
   - `sonarcloud`

---

## Bypassing Branch Protection

Only repository admins can:
- Merge PRs that don't meet status check requirements
- Merge PRs without required approvals
- Force push to protected branches

Use this power responsibly — all bypasses are audited in GitHub and should be documented.

---

## Troubleshooting

### "Required status checks are expected"
- The branch protection rule is waiting for a status check to report a result
- Check GitHub Actions tab for running workflows
- Ensure all CI jobs are triggered for your push/PR

### "Required code reviews"
- Ask a code owner (listed in `.github/CODEOWNERS`) for review
- Address feedback and push changes

### "Commit does not follow Conventional Commits"
- Run `git commit --amend` and rewrite the message to follow the format above
- Force push with `git push -f` (will trigger new CI checks)

### "Migration validation failed"
- Ensure all migration files have both up() and down() functions exported
- Run `npm run migrate:status` locally to verify migration state
- See `docs/DATABASE_MIGRATIONS.md` for migration guidelines

### "Helm chart validation failed"
- Run `helm lint helm/health-watchers` locally to check for syntax errors
- Run `helm template health-watchers helm/health-watchers` to render templates
- Ensure all required values are provided in values.yaml

### "Postman collection validation failed"
- Run `npm run postman:generate` to regenerate the collection
- Check that all required endpoints are documented in OpenAPI spec
- Verify collection JSON is valid: `jq empty docs/postman/health-watchers.postman_collection.json`

---

## See Also

- `.github/CODEOWNERS` - Code ownership rules
- `.commitlintrc.json` - Commitlint configuration
- `.github/workflows/ci.yml` - CI pipeline definition
- `docs/DATABASE_MIGRATIONS.md` - Database migration guidelines
- `POSTMAN_COLLECTION_SETUP.md` - Detailed Postman configuration guide (Issue #1584)
- `CONTRIBUTING.md` - Contribution guidelines

---

**Last Updated**: 2026-10-17  
**Issues**: #1586, #1585, #1584, #1583
