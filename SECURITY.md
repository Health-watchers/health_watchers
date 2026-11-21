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

## Multi-Tenancy & Tenant Isolation

Health Watchers is a multi-tenant platform: a single deployment serves many clinics. This section documents how tenant (clinic) data is isolated, the assumptions that isolation relies on, and the compliance considerations for multi-tenant deployments.

### Current Tenancy Model

- **Tenant identifier** — every tenant-scoped document carries a `clinicId`. The authenticated user's `clinicId` is taken from their JWT and is never trusted from the request body or query string.
- **Application-layer scoping** — all repository/service queries for tenant data include a `clinicId` filter derived from the authenticated principal. Cross-clinic access is rejected with `403 Forbidden` by the authorisation layer.
- **Shared infrastructure** — tenants share the API deployment, MongoDB cluster, and Kubernetes namespace. Isolation is therefore *logical*, enforced by application code, not by separate physical resources.

### Security Assumptions

The application-layer model is only sound while **all** of the following hold:

1. Every query that reads or writes tenant data includes the `clinicId` scope. New endpoints must use the shared scoped-repository helpers rather than raw collection access.
2. `clinicId` is always derived from the verified JWT — never from client-supplied input.
3. `clinic_admin` and `staff` roles cannot change their own `clinicId` or impersonate another clinic.
4. Database credentials used by the API are not exposed to tenants; tenants interact only through the API.
5. Audit logs record `clinicId` alongside `userId` so cross-tenant access attempts are detectable.

A defect in any of these assumptions is a **cross-tenant data exposure** and must be treated as a critical (HIPAA reportable) incident.

### Infrastructure-Level Isolation

To add defence in depth beyond application scoping:

- **Kubernetes `NetworkPolicy`** — default-deny ingress/egress per namespace, with explicit allow rules only for required traffic (API → MongoDB, API → secrets manager, ingress controller → API). If a dedicated namespace per clinic tier is adopted, each clinic namespace is isolated so pods cannot reach another clinic's namespace. See `k8s/network-policies/`.
- **Per-tier database users** — MongoDB users are provisioned per clinic tier with least-privilege roles:
  - `hw_read_<tier>` — read-only, scoped to the tier's collections/views.
  - `hw_write_<tier>` — read/write, scoped to the tier's collections.
  - The API uses the write user for its tier; reporting/analytics jobs use the read user. No user has cluster-wide `dbAdmin`/`root` privileges in production.

These controls reduce blast radius if application scoping is bypassed, but they do **not** replace the `clinicId` filter — both layers must hold.

### Cross-Tenant Penetration Test Scenario

The following scenario is part of the recurring penetration test (see [`docs/PENTEST_FINDINGS.md`](docs/PENTEST_FINDINGS.md)):

1. Authenticate as a user belonging to **Clinic A**.
2. Attempt to read, update, and delete resources belonging to **Clinic B** by:
   - substituting Clinic B resource IDs in path parameters,
   - injecting `clinicId` of Clinic B into request bodies/query strings,
   - tampering with the `clinicId` claim in the JWT (must fail signature verification),
   - replaying Clinic B's tokens/cookies from a Clinic A session.
3. **Expected result:** every attempt returns `403 Forbidden` (or `404` where resource existence must not be disclosed), no Clinic B data is returned, and the attempt is recorded in the audit log with the requesting `clinicId`.

Any successful cross-tenant access is a release blocker.

### Multi-Tenant Compliance Considerations

- **HIPAA minimum necessary** — tenant isolation is a technical safeguard supporting the minimum-necessary standard; access to PHI is limited to the treating clinic.
- **Business Associate Agreements** — each clinic tenant must have a BAA in place before PHI is stored; the shared platform is covered by the platform-level BAA.
- **Audit integrity** — audit records are tenant-tagged and retained for 7 years; cross-tenant access attempts are retained and reviewed.
- **Breach scope assessment** — because infrastructure is shared, any suspected isolation failure must be assessed for impact across *all* tenants, not just the affected clinic, and handled under the breach notification procedure in `docs/SECURITY_POLICY.md`.
- **Data residency & deletion** — tenant offboarding must purge that tenant's PHI across shared stores; deletion procedures must be verified per tenant.

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
