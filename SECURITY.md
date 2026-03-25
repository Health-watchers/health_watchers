# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main`  | ✅ Active security fixes |
| Others  | ❌ Not supported |

Only the latest commit on `main` receives security patches.

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report vulnerabilities privately using one of the following channels:

- **GitHub Private Reporting** (preferred): [Report a vulnerability](../../security/advisories/new) via GitHub's built-in private advisory feature.
- **Email**: Send details to **security@healthwatchers.io** with the subject line `[SECURITY] <brief description>`.

### What to include

- Description of the vulnerability and its potential impact
- Steps to reproduce or proof-of-concept
- Affected component(s) and version/commit
- Any suggested remediation (optional)

### Response Timeline

| Milestone | Target |
|-----------|--------|
| Acknowledgement | Within **48 hours** |
| Initial assessment | Within **5 business days** |
| Patch or mitigation | Within **30 days** for critical/high; **90 days** for medium/low |
| Public disclosure | Coordinated with reporter after patch is released |

We follow responsible disclosure. We will not take legal action against researchers who report in good faith.

---

## Security Controls

### Authentication & Authorization
- JWT-based authentication with short-lived access tokens (15 min) and rotating refresh tokens (7 days)
- Role-Based Access Control (RBAC) with six roles: `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT`, `READ_ONLY`
- Passwords hashed with bcrypt (cost factor 12)

### Transport Security
- All production traffic served over HTTPS/TLS 1.2+
- HTTP Strict Transport Security (HSTS) enforced

### Data Security
- MongoDB Atlas with encryption at rest
- Stellar blockchain transactions provide an immutable audit trail for all payments
- Sensitive environment variables managed via secrets manager (never committed to source)

### API Security
- Input validation on all endpoints via Zod schemas
- Rate limiting applied to authentication endpoints
- API documentation (`/api/docs`) protected by Basic Auth in production

### Infrastructure
- Docker containers run as non-root users
- Dependency vulnerability scanning via `npm audit` in CI
- Secret scanning workflow on every push (`.github/workflows/secrets-scanning.yml`)

---

## HIPAA Compliance

Health Watchers is designed with HIPAA technical safeguard requirements in mind:

| Safeguard | Implementation |
|-----------|---------------|
| **Access Control** | RBAC enforces minimum necessary access per role |
| **Audit Controls** | Stellar blockchain provides tamper-evident payment audit logs; API access logged |
| **Integrity** | Input validation and schema enforcement on all PHI fields |
| **Transmission Security** | TLS enforced for all data in transit |
| **Authentication** | Unique user identification via JWT; MFA flow documented in design |

> ⚠️ **Note:** This project is currently a scaffold (approximately 10% implemented). A formal HIPAA risk assessment and Business Associate Agreements (BAAs) must be completed before handling real Protected Health Information (PHI) in production.

---

## Data Retention & Deletion Policy

| Data Type | Retention Period | Deletion Method |
|-----------|-----------------|-----------------|
| Patient records | Duration of care relationship + 7 years (regulatory minimum) | Soft-delete (`isActive: false`), hard-delete on verified request |
| Encounter records | 7 years from date of service | Soft-delete, hard-delete on verified request |
| Payment records | 7 years (financial compliance) | Immutable on-chain; off-chain record soft-deleted |
| Auth tokens | Access: 15 min / Refresh: 7 days | Automatic expiry |
| User accounts | Until account closure request | Soft-delete with 30-day recovery window, then hard-delete |

**Right to erasure requests** (where legally permissible) should be submitted to **privacy@healthwatchers.io**. Requests are processed within 30 days.

---

## Dependency Management

- Dependencies are reviewed and updated regularly
- `npm audit` runs on every CI build; critical vulnerabilities block merges
- Dependabot alerts are enabled on this repository

---

*Last updated: March 2026*
