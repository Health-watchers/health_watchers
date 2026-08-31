# Automated Security Vulnerability Detection

The `.github/workflows/security-scan.yml` workflow runs on every push, PR,
and nightly on a schedule.

## Scanners

| Layer | Tool | Job |
|---|---|---|
| SAST | CodeQL, Semgrep (OWASP Top 10) | `sast` |
| DAST | OWASP ZAP baseline scan | `dast` |
| Dependencies | npm audit, Snyk | `dependency-scan` |
| Container images | Trivy | `container-scan` |
| Secrets | Gitleaks | `secrets-scan` |
| License compliance | license-checker | `license-compliance` |

## Aggregation and gating

`scripts/security/aggregate-report.js` collects artifacts from every
scanner job into a single `security-summary.md`, tagging each finding with
its category and remediation guidance (see the `REMEDIATION_GUIDANCE` map
in that script).

`scripts/security/gate.js` reads the aggregated summary and fails the build
when critical findings are present, blocking deployment per the CI/CD
pipeline's `docker-build` dependency chain.

## Reducing false positives

- Semgrep and CodeQL rules are scoped to `security-and-quality` /
  `owasp-top-ten` rulesets rather than experimental rule packs.
- Gitleaks allowlists binary and test-fixture paths in `.gitleaks.toml`.
- License compliance only blocks on copyleft licenses explicitly listed in
  the `--failOn` flag.

## Remediation guidance

Each entry in the aggregated report includes actionable guidance, e.g.
rotating leaked credentials, bumping vulnerable dependency versions, or
rebuilding container images from a patched base layer.
