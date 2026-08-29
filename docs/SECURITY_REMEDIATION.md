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
