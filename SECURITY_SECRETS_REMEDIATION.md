# Secrets Scanning & Remediation Guide

## Overview

This document provides guidance on handling leaked secrets and preventing future leaks in the Health Watchers repository.

## Current Status

**Leaked Secrets Found: 1 (in git history)**

### Identified Leaks

#### 1. JWT Secret in `.env.local` (Git History)

- **File**: `.env.local`
- **Commit**: `c277695bc7efa071f414986be37b5d402d5a7e9a`
- **Secret**: `JWT_SECRET=supersecret_change_in_production`
- **Status**: In git history only (file is already in `.gitignore`)

### Remediation Steps

#### Step 1: Rotate the Secret

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

#### Step 2: Remove from Git History

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

#### Step 3: Verify Removal

```bash
# Scan the entire history to ensure the secret is gone
docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source=/repo
```

## Prevention Measures

### 1. Pre-commit Hook

A pre-commit hook is installed to prevent secrets from being committed. It uses gitleaks to scan staged changes.

**Location**: `.git/hooks/pre-commit`

**To Install/Update**:
```bash
npm run setup:hooks
```

### 2. GitHub Actions Workflow

The repository includes automated secrets scanning on:
- Every push to `main` and `develop`
- Every pull request
- Weekly scheduled scans (Mondays at 03:00 UTC)

**Workflow File**: `.github/workflows/secrets-scanning.yml`

### 3. Gitleaks Configuration

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

## Best Practices

### DO:
✅ Use environment variables for all secrets
✅ Store secrets in `.env.local` (which is in `.gitignore`)
✅ Use GitHub Secrets for CI/CD
✅ Rotate secrets regularly (especially after incidents)
✅ Review gitleaks scan results before merging
✅ Document sensitive operations for team members

### DON'T:
❌ Commit actual secrets to the repository
❌ Use hardcoded credentials in code
❌ Store `.env.local` file in git (should be in `.gitignore`)
❌ Ignore gitleaks scan failures
❌ Disable secret scanning checks
❌ Commit secrets even if you plan to delete them later

## Handling False Positives

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

## Scanning Commands

### Local Scan
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

### GitHub Actions Scan
- Results appear in the **Security** → **Code scanning alerts** tab
- Pull requests receive automatic comments with summary
- Scan results are archived as artifacts

## Incident Response

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

## Additional Resources

- [Gitleaks Documentation](https://github.com/gitleaks/gitleaks)
- [git-filter-repo Guide](https://github.com/newren/git-filter-repo)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

## Questions?

For questions or issues related to secrets scanning, please:
1. Check this guide
2. Review the `.gitleaks.toml` configuration
3. Consult with the security team
4. Open an issue with the `security` label
