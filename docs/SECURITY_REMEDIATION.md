# Security Remediation Playbook

Health Watchers — security scan results tracking and remediation.

## Scans in CI

| Workflow | Tool | Trigger |
|----------|------|---------|
| `security-scanning.yml` | Snyk SAST, npm audit, Trivy | Push / PR / Weekly |
| `secrets-scanning.yml` | Gitleaks | Push / PR |
| `security-audit.yml` | Custom audit | Push / PR |
| `dependabot-security.yml` | Dependabot | Daily |

## Remediation Tracking

### Severity Classification

| Severity | SLA | Action |
|----------|-----|--------|
| Critical | 24 hours | Block merge, patch or downgrade dependency |
| High | 7 days | Create issue, assign owner, target next sprint |
| Medium | 30 days | Track in backlog, review quarterly |
| Low | 90 days | Optional fix during maintenance windows |

### Workflow

1. Scan runs on PR and push to `main` / `develop`.
2. If scan fails, GitHub Security tab lists vulnerabilities.
3. `remediation-tracking` job in `security-scanning.yml` creates a GitHub issue titled `[Security] Vulnerabilities Found in Scan`.
4. Assign issue to the PR author or team lead.
5. Triage:
   - Patch dependency.
   - Replace unmaintained package.
   - Accept risk with documented justification if no patch exists.
6. Re-run scan after fix.
7. Close issue when reports are clean.

## Common Findings

### Dependency Vulnerabilities

- Update affected package: `npm update <package>` or `npm install <package>@latest`.
- If no patch exists, evaluate alternative packages.

### Container Vulnerabilities

- Trivy reports image-layer CVEs.
- Update base image tag in `Dockerfile`.
- Remove unused packages in Docker image.

### License Compliance

- `license-checker` blocks non-permissive licenses.
- Replace blocked dependency or request an exception.

## Secrets & Credentials

- Never add secrets to `.env` in git.
- Use `.env.example` for required keys only.
- Run `gitleaks` locally before push if unsure.

## Audit Log

Security remediation issues are labeled `security` and `automated`.

## Remediation Log: 2026-08

**Date:** 2026-08-31  
**Issue:** #1162 — Weekly Dependency Audit  
**Author:** Health Watchers Security Team

---

### Critical Vulnerabilities Fixed

#### CVE: path-to-regexp — ReDoS (Regular Expression Denial of Service)
- **Package:** `path-to-regexp`
- **Severity:** Critical
- **Fix:** Forced to `^0.1.12` via root `overrides` (backport includes the security patch)
- **Impact:** Prevents ReDoS attacks against Express route matching

#### CVE: cookie — Cookie parsing vulnerability
- **Package:** `cookie`
- **Severity:** High
- **Fix:** Forced to `^0.7.0` via root `overrides`
- **Impact:** Prevents cookie injection attacks

---

### Transitive Dependency Overrides (root package.json)

These overrides force safe versions of packages that appear as transitive dependencies across the monorepo:

| Package | Forced Version | CVE / Reason |
|---------|---------------|--------------|
| `ip` | `^2.0.1` | SSRF via incorrect IP parsing |
| `semver` | `^7.5.4` | ReDoS in semver range parsing |
| `word-wrap` | `^1.2.4` | ReDoS vulnerability |
| `tough-cookie` | `^4.1.3` | Prototype pollution |
| `@babel/traverse` | `^7.23.2` | Code injection vulnerability |
| `axios` | `^1.6.0` | SSRF and credential leakage |
| `braces` | `^3.0.3` | ReDoS in brace expansion |
| `micromatch` | `^4.0.8` | ReDoS in glob matching |
| `ws` | `^8.17.1` | HTTP header injection |
| `path-to-regexp` | `^0.1.12` | ReDoS in route matching |
| `cookie` | `^0.7.0` | Cookie injection |
| `cross-spawn` | `^7.0.6` | Command injection on Windows |
| `nanoid` | `^3.3.8` | Predictable ID generation |
| `tar` | `^6.2.1` | Path traversal in tar extraction |
| `node-fetch` | `^2.7.0` | SSRF via redirect handling |
| `jsonwebtoken` | `^9.0.0` | Algorithm confusion attacks |

---

### Direct Dependency Updates

#### apps/api/package.json

| Package | From | To | Reason |
|---------|------|----|--------|
| `@aws-sdk/client-s3` | `^3.806.0` | `^3.1116.0` | Security patches + API improvements |
| `@aws-sdk/s3-request-presigner` | `^3.806.0` | `^3.1116.0` | Matching SDK version |
| `@sentry/node` | `^8.0.0` | `^8.55.2` | Security patches and performance improvements |
| `@sentry/profiling-node` | `^8.0.0` | `^8.55.2` | Matching Sentry version |

#### apps/web/package.json

| Package | From | To | Reason |
|---------|------|----|--------|
| `@sentry/nextjs` | `^10.50.0` | `^10.70.0` | Security patches for Next.js 14 |
| `@playwright/test` | `^1.44.0` | `^1.62.1` | Security fixes and test stability |
| `@tanstack/react-query` | `^5.100.1` | `^5.102.2` | Bug fixes and security hardening |
| `@tailwindcss/postcss` | `^4.2.4` | `^4.3.3` | Security patches for PostCSS pipeline |

---

### How to Verify

After running `npm install`, verify no critical vulnerabilities remain:

```bash
# Audit the entire monorepo
npm audit

# Audit with JSON output for CI
npm audit --json > audit.json

# Check only critical/high
npm audit --audit-level=high

# Verify a specific override is applied
npm ls path-to-regexp
npm ls cookie
```

Expected output after fix:
```
found 0 vulnerabilities
```

Or at worst, only informational/low severity findings in dev dependencies.

---

### Override Strategy Notes

- Root `overrides` apply to **all workspaces** that inherit from the root `package-lock.json`
- Workspaces `apps/web` and `apps/stellar-service` are not in root `workspaces[]` — they manage
  their own `node_modules`. Consider adding workspace-level overrides if `npm audit` still reports
  issues in those apps after installing.
- Re-audit after each `npm install` to confirm transitive resolutions are applied.
- Monitor `npm audit` output in CI (see `.github/workflows/ci.yml`) for regression detection.

---

### Next Audit

Scheduled: **2026-09-07** (weekly cadence)  
Responsible: Security team  
Tracking: GitHub Security tab → Dependabot alerts

## Secrets Leak Remediation

### Overview

This document provides guidance on handling leaked secrets and preventing future leaks in the Health Watchers repository.

### Current Status

**Leaked Secrets Found: 1 (in git history)**

#### Identified Leaks

##### 1. JWT Secret in `.env.local` (Git History)

- **File**: `.env.local`
- **Commit**: `c277695bc7efa071f414986be37b5d402d5a7e9a`
- **Secret**: `JWT_SECRET=supersecret_change_in_production`
- **Status**: In git history only (file is already in `.gitignore`)

#### Remediation Steps

##### Step 1: Rotate the Secret

1. Generate a new secure JWT secret (minimum 32 characters)
   ```bash
   openssl rand -base64 32
   ```

2. Update all deployed instances:
   - Update production environment variables
   - Update staging environment variables
   - Update any backup secrets

3. Update GitHub Secrets:
   ```bash
   # Using GitHub CLI
   gh secret set JWT_SECRET -b "your-new-secret-here"
   ```

##### Step 2: Remove from Git History

⚠️ **Important**: This requires force-pushing and coordination with the team.

**Option A: Using git-filter-repo (Recommended)**

```bash
# Install git-filter-repo
pip install git-filter-repo

# Remove the .env.local file from all history
git filter-repo --path .env.local --invert-paths

# Force push to all branches (USE WITH CAUTION)
git push origin --force-with-lease --all
git push origin --force-with-lease --tags
```

**Option B: Using BFG Repo Cleaner**

```bash
# Install BFG
brew install bfg

# Remove the .env.local file
bfg --delete-files .env.local

# Clean up and force push
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push origin --force-with-lease --all
```

##### Step 3: Verify Removal

```bash
# Scan the entire history to ensure the secret is gone
docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source=/repo
```

### Prevention Measures

#### 1. Pre-commit Hook

A pre-commit hook is installed to prevent secrets from being committed. It uses gitleaks to scan staged changes.

**Location**: `.git/hooks/pre-commit`

**To Install/Update**:
```bash
npm run setup:hooks
```

#### 2. GitHub Actions Workflow

The repository includes automated secrets scanning on:
- Every push to `main` and `develop`
- Every pull request
- Weekly scheduled scans (Mondays at 03:00 UTC)

**Workflow File**: `.github/workflows/secrets-scanning.yml`

#### 3. Gitleaks Configuration

Custom rules and allowlists are configured in `.gitleaks.toml`:
- Scans for JWT secrets
- Scans for MongoDB connection strings with credentials
- Scans for Stellar blockchain secret keys
- Scans for API keys (Gemini, Google, etc.)

**False Positive Exclusions**:
- Test fixtures and unit tests
- Docker Compose files with environment variable references
- Kubernetes configuration files with placeholders
- CI/CD workflow files with test credentials

### Best Practices

#### DO:
✅ Use environment variables for all secrets
✅ Store secrets in `.env.local` (which is in `.gitignore`)
✅ Use GitHub Secrets for CI/CD
✅ Rotate secrets regularly (especially after incidents)
✅ Review gitleaks scan results before merging
✅ Document sensitive operations for team members

#### DON'T:
❌ Commit actual secrets to the repository
❌ Use hardcoded credentials in code
❌ Store `.env.local` file in git (should be in `.gitignore`)
❌ Ignore gitleaks scan failures
❌ Disable secret scanning checks
❌ Commit secrets even if you plan to delete them later

### Handling False Positives

If gitleaks reports a false positive:

1. **For test fixtures**: Add the file to the `paths` array in `.gitleaks.toml`
2. **For patterns**: Add regex patterns to the `regexes` array in `.gitleaks.toml`
3. **For specific lines**: Add inline `gitleaks:allow` comments:
   ```javascript
   // gitleaks:allow
   const testSecret = "test-secret-value";
   ```

4. **Validate changes**:
   ```bash
   docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source=/repo --config=/repo/.gitleaks.toml
   ```

### Scanning Commands

#### Local Scan
```bash
# Full repository scan
docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source=/repo

# With custom config
docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source=/repo --config=/repo/.gitleaks.toml

# Generate JSON report
docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source=/repo --report-format=json --report-path=/repo/gitleaks-report.json

# Scan only changes since main
docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source=/repo --log-opts=origin/main..HEAD
```

#### GitHub Actions Scan
- Results appear in the **Security** → **Code scanning alerts** tab
- Pull requests receive automatic comments with summary
- Scan results are archived as artifacts

### Incident Response

If a secret is discovered to be compromised:

1. **Immediate Actions**:
   - Rotate the secret immediately
   - Update all systems using the secret
   - Notify relevant team members

2. **Investigation**:
   - Determine when the secret was exposed
   - Check logs for unauthorized access
   - Review who had access to the compromised secret

3. **Remediation**:
   - Follow the removal steps above
   - Re-run all security scans
   - Document the incident

4. **Prevention**:
   - Review and strengthen access controls
   - Update pre-commit hooks if needed
   - Consider additional secret rotation policies

### Additional Resources

- [Gitleaks Documentation](https://github.com/gitleaks/gitleaks)
- [git-filter-repo Guide](https://github.com/newren/git-filter-repo)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

### Questions?

For questions or issues related to secrets scanning, please:
1. Check this guide
2. Review the `.gitleaks.toml` configuration
3. Consult with the security team
4. Open an issue with the `security` label
