# Dependency Vulnerability Scanning

**Issue**: #1051

This document describes the dependency vulnerability scanning system implemented for the Health Watchers project.

## Overview

The vulnerability scanning system provides automated and manual tools to identify, track, and remediate security vulnerabilities in project dependencies.

## Components

### 1. GitHub Actions Workflow

**File**: `.github/workflows/dependency-scan.yml`

Automated scanning pipeline that runs:
- **On Push**: Scans main and develop branches
- **On Pull Requests**: Reviews dependency changes
- **Daily**: Scheduled scan at 2 AM UTC
- **Manual**: Via workflow dispatch

#### Scanning Tools

1. **NPM Audit**: Native npm vulnerability scanner
   - Scans all workspaces independently
   - Generates JSON and text reports
   - Threshold: moderate severity

2. **Trivy**: Container and filesystem vulnerability scanner
   - Scans entire repository
   - Detects CRITICAL, HIGH, and MEDIUM vulnerabilities
   - Uploads results to GitHub Security

3. **Snyk** (optional): Commercial security scanner
   - Requires `SNYK_TOKEN` secret
   - Scans all projects
   - Skipped on scheduled runs to conserve credits

4. **Dependency Review**: GitHub native PR scanner
   - Runs only on pull requests
   - Reviews license compliance
   - Blocks PRs with moderate+ vulnerabilities

### 2. Local Scanning Script

**File**: `scripts/scan-dependencies.sh`

Bash script for local vulnerability scanning before commits.

#### Usage

```bash
# Run full scan
npm run security:scan

# Or directly
bash scripts/scan-dependencies.sh
```

#### Features

- Scans all workspaces
- Generates JSON and text reports
- Creates consolidated summary
- Color-coded output
- Exit code 1 on critical/high vulnerabilities

#### Output

Reports are saved to: `security-reports/dependency-scans/`

Files generated:
- `npm-audit-{workspace}-{timestamp}.json` - Machine-readable report
- `npm-audit-{workspace}-{timestamp}.txt` - Human-readable report
- `scan-summary-{timestamp}.md` - Consolidated summary

### 3. Vulnerability Tracking System

**File**: `scripts/track-vulnerabilities.js`

Node.js script to track vulnerabilities across scan cycles.

#### Usage

```bash
# Update tracking data from latest scans
npm run security:track

# Generate status report
npm run security:report

# Run complete security workflow
npm run security:full
```

#### Features

- Tracks vulnerability lifecycle (open → resolved)
- Maintains 30-day scan history
- Identifies trends over time
- Tracks fix availability
- Persists state in `security-reports/vulnerability-tracking.json`

#### Tracking Data Structure

```json
{
  "lastScan": "2024-01-15T10:30:00.000Z",
  "vulnerabilities": {
    "workspace:package:issue": {
      "package": "example-package",
      "workspace": "apps-api",
      "severity": "high",
      "firstDetected": "2024-01-10T10:00:00.000Z",
      "lastSeen": "2024-01-15T10:30:00.000Z",
      "status": "open",
      "fixAvailable": true
    }
  },
  "history": [
    {
      "date": "2024-01-15T10:30:00.000Z",
      "workspaces": {},
      "totals": {
        "critical": 0,
        "high": 2,
        "moderate": 5,
        "low": 3,
        "info": 1
      }
    }
  ]
}
```

## Workflow

### Automated (CI/CD)

1. Developer pushes code or creates PR
2. GitHub Actions triggers dependency scan
3. Multiple scanners run in parallel
4. Results uploaded to GitHub Security
5. PR checks pass/fail based on findings
6. Team notified of critical issues

### Manual (Local Development)

1. Run `npm run security:scan` to scan dependencies
2. Review generated reports in `security-reports/dependency-scans/`
3. Run `npm run security:track` to update tracking
4. Run `npm run security:report` to see current status
5. Address vulnerabilities as needed

### Complete Workflow

```bash
# One command to run everything
npm run security:full
```

This will:
1. Scan all dependencies
2. Update vulnerability tracking
3. Display status report

## Addressing Vulnerabilities

### Step 1: Identify

Run scans to identify vulnerabilities:

```bash
npm run security:scan
```

### Step 2: Review

Check the severity and fix availability:

```bash
npm run security:report
```

### Step 3: Attempt Auto-Fix

Try automatic fixes first:

```bash
cd apps/api  # or affected workspace
npm audit fix
```

For breaking changes:

```bash
npm audit fix --force  # Use with caution!
```

### Step 4: Manual Updates

If auto-fix doesn't work:

```bash
# Update specific package
npm install package-name@latest

# Or update package.json and reinstall
npm install
```

### Step 5: Verify

After fixes, rescan:

```bash
npm run security:scan
npm run security:track
```

### Step 6: Document

If a vulnerability cannot be fixed immediately:

1. Create an issue
2. Document the reason (e.g., no fix available, breaking change)
3. Add to tracking system notes
4. Set a remediation timeline

## Integration with Development Workflow

### Pre-commit Hook (Optional)

Add to `.husky/pre-commit`:

```bash
#!/bin/sh
# Run quick vulnerability check
npm audit --audit-level=high
```

### Pre-push Hook (Recommended)

Add to `.husky/pre-push`:

```bash
#!/bin/sh
# Run full security scan before push
npm run security:scan
```

### CI/CD Pipeline

The GitHub Actions workflow automatically runs on:
- Push to main/develop
- Pull requests
- Daily schedule
- Manual trigger

## Severity Levels

| Level | Description | Action Required |
|-------|-------------|-----------------|
| **Critical** | Exploitable vulnerabilities with severe impact | Immediate fix required |
| **High** | Significant security risk | Fix within 7 days |
| **Moderate** | Potential security issue | Fix within 30 days |
| **Low** | Minor security concern | Fix when convenient |
| **Info** | No security risk, informational only | No action required |

## Best Practices

1. **Regular Scans**: Run `npm run security:scan` weekly
2. **Before Releases**: Always scan before deploying to production
3. **Dependency Updates**: Keep dependencies up to date
4. **Pin Versions**: Use exact versions in production
5. **Review Changes**: Check dependency changes in PRs
6. **Track Trends**: Monitor vulnerability trends over time
7. **Document Exceptions**: Document why vulnerabilities can't be fixed
8. **Test After Updates**: Always test after updating dependencies

## Reporting

### GitHub Security Tab

- View all detected vulnerabilities
- See Dependabot alerts
- Track remediation status
- Configure automated security updates

### Local Reports

Reports are saved to `security-reports/dependency-scans/`:
- JSON format for automation
- Text format for human review
- Markdown summaries for documentation

### Notifications

Configure GitHub to send notifications for:
- New vulnerabilities detected
- Failed security checks
- Dependency review failures

## Troubleshooting

### Scan Script Fails

```bash
# Ensure bash is available
which bash

# Make script executable
chmod +x scripts/scan-dependencies.sh

# Check dependencies
npm ci
```

### No Reports Generated

```bash
# Ensure report directory exists
mkdir -p security-reports/dependency-scans

# Check write permissions
ls -la security-reports/
```

### False Positives

If a vulnerability is a false positive:

1. Document why it's not a real issue
2. Create a `.auditignore` file (if supported)
3. Use `npm audit --production` to ignore dev dependencies
4. Update tracking system with notes

### Tracking Issues

```bash
# Reset tracking if corrupted
rm security-reports/vulnerability-tracking.json
npm run security:track
```

## Configuration

### GitHub Secrets

Required secrets for full functionality:

- `SNYK_TOKEN` (optional): Snyk API token for enhanced scanning

### Environment Variables

No environment variables required for basic functionality.

### Customization

Edit `scripts/scan-dependencies.sh` to:
- Add/remove workspaces
- Change report location
- Adjust severity thresholds
- Add custom scanners

## Future Enhancements

Potential improvements:

1. **Automated PRs**: Auto-create PRs for dependency updates
2. **Slack Integration**: Send notifications to Slack
3. **Dashboard**: Web dashboard for vulnerability tracking
4. **Policy Enforcement**: Block deploys with vulnerabilities
5. **SLA Tracking**: Track time-to-remediation metrics
6. **Supply Chain Security**: Verify package integrity

## Related Documentation

- [Security Policy](../SECURITY.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
- [GitHub Actions Workflows](../.github/workflows/)

## Support

For questions or issues:

1. Check this documentation
2. Review scan reports
3. Create an issue with `security` label
4. Contact the security team

## References

- [npm audit documentation](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [GitHub Dependency Review](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review)
- [Trivy Scanner](https://github.com/aquasecurity/trivy)
- [Snyk Documentation](https://docs.snyk.io/)
