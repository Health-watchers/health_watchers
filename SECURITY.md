# Security Policy

Health Watchers is a HIPAA-compliant healthcare management platform. Security is a first-class concern across every layer of the stack. This document describes our security model, practices, and how to report vulnerabilities.

For the comprehensive threat model, security guidelines, incident response procedures, and the full security checklist, see [`docs/SECURITY_POLICY.md`](docs/SECURITY_POLICY.md).

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ Active |
| Previous releases | ⚠️ Security patches only |
| Releases > 6 months old | ❌ No longer supported |

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report security issues by emailing **security@healthwatchers.com**.

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept if available)
- Affected component(s) and version(s)
- Suggested remediation (optional)

### What to Expect

| Step | Timeline |
|------|----------|
| Acknowledgement | Within 24 hours |
| Initial assessment | Within 3 business days |
| Fix or workaround | Within 30 days (critical: 7 days) |
| Coordinated disclosure | Agreed with reporter |

We follow responsible disclosure. Reporters who give us a reasonable time to fix an issue before public disclosure will be credited in the release notes and receive our sincere thanks.

### Scope

**In scope:**
- Authentication and authorisation bypass
- Injection attacks (NoSQL, command, template)
- Insecure direct object references
- Sensitive data exposure (PHI, credentials, keys)
- Cryptographic weaknesses
- Server-side vulnerabilities in `apps/api`, `apps/stellar-service`

**Out of scope:**
- Social engineering or phishing attacks
- Physical security
- Issues in dependencies that are already publicly disclosed
- Vulnerabilities that require physical access to a device
- Performance-only issues with no security impact

---

## CSRF Protection

Health Watchers uses the **double-submit cookie** pattern to protect state-changing API endpoints.

### How It Works

1. On the first request to the API, the server sets a non-`HttpOnly` cookie `csrf-token` containing a random 32-byte hex token.
2. The frontend JavaScript reads this cookie and includes its value in the `X-CSRF-Token` request header on all `POST`, `PUT`, `PATCH`, and `DELETE` requests.
3. The `csrfMiddleware` in `apps/api/src/middlewares/csrf.middleware.ts` validates that the header value matches the cookie value. A mismatch results in a `403 Forbidden` response.

### Why This Works

Cross-origin requests from a malicious site cannot read the `csrf-token` cookie value (blocked by the Same-Origin Policy), so they cannot forge the required header.

### Exceptions

- `GET`, `HEAD`, and `OPTIONS` requests are exempt (read-only).
- `/api/v1/auth/login` and `/api/v1/auth/register` are exempt (no session exists yet).

### Cookie Security

| Cookie | HttpOnly | Secure (prod) | SameSite |
|--------|----------|---------------|----------|
| `csrf-token` | ❌ (must be JS-readable) | ✅ | Strict |
| `accessToken` (web) | ❌ (Next.js middleware reads it) | Recommended | Strict |

---

## Key Security Controls

### Authentication & Authorisation
- JWT access tokens (1-hour expiry) with rotating refresh tokens (7-day expiry)
- TOTP-based MFA enforced for all provider and admin accounts
- Role-based access control (RBAC): `admin`, `clinic_admin`, `provider`, `staff`, `patient`
- Clinic-scoped data isolation — providers can only access patients within their own clinic

### Data Protection
- AES-256-GCM field-level encryption for PHI (DOB, contact number, address, insurance policy/group numbers); see `docs/SECURITY_POLICY.md` for full field coverage
- Encryption keys managed in AWS Secrets Manager, with versioned key rotation supported at the application layer
- TLS 1.3 enforced for all data in transit
- MongoDB encryption at rest enabled in production

### Audit Logging
- Every read, write, and delete of PHI is logged (user ID, timestamp, IP, resource ID)
- Audit logs retained for 7 years to meet HIPAA requirements
- Logs shipped to CloudWatch / ELK and are tamper-evident

### API Security
- Rate limiting: 100 req/min per IP general; 5 req/min on auth endpoints
- Input validation with Joi on all request bodies
- `express-mongo-sanitize` blocks NoSQL injection
- Helmet sets security headers (CSP, HSTS, X-Frame-Options, etc.)
- CORS restricted to allow-listed origins

### Dependency Management
- Automated Dependabot PRs weekly
- `npm audit` runs as a required CI gate (blocks on high/critical)
- Snyk scanning on every PR
- License compatibility enforced (no GPL in production)

### Secrets Management
- No secrets in source code — enforced by `gitleaks` pre-commit hook and CI secrets scanning
- All credentials stored in AWS Secrets Manager or GitHub Actions encrypted secrets
- Secret rotation schedule: JWT secrets quarterly, DB credentials monthly

---

## HIPAA Compliance

Health Watchers is designed to meet the HIPAA Security Rule requirements:

- **Access control** — Unique user IDs, automatic session timeout, role-based permissions
- **Audit controls** — Comprehensive logging of all PHI access and modifications
- **Integrity controls** — Checksums and signed transactions for data integrity
- **Transmission security** — TLS 1.3 in transit; encrypted payloads for sensitive fields
- **Breach notification** — Incident response plan in `docs/SECURITY_POLICY.md`

---

## Security Resources

| Resource | Location |
|----------|----------|
| Threat model & full security guidelines | [`docs/SECURITY_POLICY.md`](docs/SECURITY_POLICY.md) |
| Penetration test findings | [`docs/PENTEST_FINDINGS.md`](docs/PENTEST_FINDINGS.md) |
| Penetration test remediation | [`docs/PENTEST_REMEDIATION.md`](docs/PENTEST_REMEDIATION.md) |
| Secrets management runbook | [`monitoring/runbooks/SECRETS_MANAGEMENT.md`](monitoring/runbooks/SECRETS_MANAGEMENT.md) |
| Kubernetes secrets policy | [`k8s/SECRETS_MANAGEMENT.md`](k8s/SECRETS_MANAGEMENT.md) |
| Security scanning workflow | [`.github/workflows/security-scanning.yml`](.github/workflows/security-scanning.yml) |

---

## Contact

| Team | Email |
|------|-------|
| Security | security@healthwatchers.com |
| Compliance | compliance@healthwatchers.com |
| DevOps | devops@healthwatchers.com |
