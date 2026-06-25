# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities to **security@healthwatchers.com**. Do not open public GitHub issues for security vulnerabilities.

We aim to respond within 48 hours and will coordinate a fix and disclosure timeline with you.

---

## Stellar Private Key Encryption (Issue #596)

### Overview

Clinic Stellar secret keys (starting with `S`) provide full control over a clinic's Stellar account. A single database breach without encryption would allow an attacker to drain all clinic funds.

### Implementation

Stellar secret keys are encrypted at rest using **AES-256-GCM** before storage in MongoDB. The implementation is in `apps/api/src/modules/clinics/keypair.service.ts`.

**Key separation:** The Stellar keypair encryption uses a dedicated `KEYPAIR_ENCRYPTION_KEY` environment variable — a separate 32-byte key from the PHI field encryption key (`FIELD_ENCRYPTION_KEY`). This ensures that compromising one key does not expose both PHI and Stellar secrets.

**Storage format:**
- `encryptedSecretKey`: `<ciphertext_hex>:<auth_tag_hex>` — AES-256-GCM ciphertext with authentication tag
- `iv`: `<iv_hex>` — 16-byte random IV stored separately

**Guarantees:**
- Raw Stellar secret keys (starting with `S`) are **never** stored in MongoDB
- Each encryption uses a fresh random IV (no IV reuse)
- GCM authentication tag prevents ciphertext tampering
- Decryption failures are counted via the `mongodb_keypair_decryption_failures_total` Prometheus metric and trigger a critical alert

### Environment Variables

| Variable | Description | Required |
|---|---|---|
| `KEYPAIR_ENCRYPTION_KEY` | 64-char hex string (32 bytes) for Stellar keypair encryption | Yes |
| `FIELD_ENCRYPTION_KEY` | 64-char hex string (32 bytes) for PHI field encryption | Yes |

Generate a secure key:
```bash
openssl rand -hex 32
```

### Key Rotation

To rotate the `KEYPAIR_ENCRYPTION_KEY`:

1. Generate a new key: `openssl rand -hex 32`
2. Write a migration script that:
   - Reads each `ClinicKeypair` document
   - Decrypts `encryptedSecretKey` with the **old** key
   - Re-encrypts with the **new** key
   - Updates the document and increments `keyVersion`
3. Deploy the migration before updating the environment variable
4. Update `KEYPAIR_ENCRYPTION_KEY` in your secrets manager (AWS Secrets Manager / HashiCorp Vault)

### Future Improvements

- **AWS KMS / HashiCorp Vault**: For production, consider wrapping the `KEYPAIR_ENCRYPTION_KEY` with a KMS-managed Key Encryption Key (KEK). This provides hardware-backed key protection and automatic key rotation.
- **Envelope encryption**: Store only the encrypted data key in the database; the master key never leaves KMS.

---

## PHI Field Encryption

Patient PHI fields (`contactNumber`, `address`, `dateOfBirth`) are encrypted at rest using AES-256-GCM via `apps/api/src/lib/encrypt.ts`. The encryption key is configured via `FIELD_ENCRYPTION_KEY`.

---

## Authentication & Authorization

- JWT-based authentication with short-lived access tokens and rotating refresh tokens
- Role-based access control (SUPER_ADMIN, CLINIC_ADMIN, DOCTOR, NURSE, ASSISTANT, READ_ONLY)
- MFA support via TOTP

---

## Monitoring & Alerting

Security-relevant Prometheus alerts are defined in `monitoring/alerts.yml`:

- `StellarKeypairDecryptionFailure` — fires immediately on any decryption failure (critical)
- `MongoDBPoolHighUtilization` — fires when pool utilization > 80% for 2 minutes (warning)
- `MongoDBPoolWaitQueueNonEmpty` — fires when requests queue for connections (critical)
# Security Guidelines

Health Watchers is designed with HIPAA and GDPR compliance in mind. This document outlines security practices and guidelines.

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [Data Protection](#data-protection)
3. [API Security](#api-security)
4. [Incident Response](#incident-response)
5. [Compliance](#compliance)
6. [Reporting Security Issues](#reporting-security-issues)

## Authentication & Authorization

### Password Policy

- Minimum 12 characters
- Must contain uppercase, lowercase, numbers, and special characters
- Passwords hashed with bcrypt (cost 12)
- Password reset tokens expire after 1 hour
- Account lockout after 5 failed login attempts (15 minutes)

### Multi-Factor Authentication

- TOTP (Time-based One-Time Password) available for admin roles
- Backup codes generated during MFA setup
- MFA required for SUPER_ADMIN and CLINIC_ADMIN roles

### Token Management

- Access tokens expire after 15 minutes
- Refresh tokens expire after 7 days
- Refresh token rotation: new token issued on each refresh
- Tokens stored in secure HTTP-only cookies
- Token revocation on logout

### Access Token Invalidation (Redis-backed)

Access tokens are short-lived (15 min) but can be explicitly invalidated before expiry:

- **Per-token denylist**: Each access token carries a `jti` (UUID v4) claim. On logout or password change, the `jti` is stored in Redis with a TTL equal to the token's remaining lifetime. `verifyAccessToken` rejects any token whose `jti` is in the denylist.
- **Logout-all**: `POST /api/v1/auth/logout-all` stores a per-user invalidation timestamp (`user-invalidated:{userId}`) in Redis. All access tokens with an `iat` (issued-at) before that timestamp are rejected, effectively invalidating every active session for the user.
- **Graceful degradation**: If Redis is unavailable, denylist checks are skipped and tokens remain valid until natural expiry. This is acceptable given the 15-minute access token lifetime.

Redis keys used:

| Key pattern | Purpose | TTL |
|---|---|---|
| `token-denylist:{jti}` | Single-token revocation | Token's remaining lifetime |
| `user-invalidated:{userId}` | Logout-all timestamp | 7 days |

### Role-Based Access Control (RBAC)

Roles and permissions:

| Role | Permissions |
|------|-------------|
| SUPER_ADMIN | Full system access |
| CLINIC_ADMIN | Clinic management, user management, billing |
| DOCTOR | Patient management, encounter creation, prescriptions |
| NURSE | Patient management, vital signs, basic documentation |
| ASSISTANT | Appointment scheduling, patient communication |
| READ_ONLY | View-only access to patient records |
| PATIENT | Access own records, appointments, payments |

## Data Protection

### Encryption

- **At Rest**: AES-256-GCM encryption for sensitive data
- **In Transit**: TLS 1.2+ enforced, HTTPS only in production
- **Database**: MongoDB encryption at rest enabled
- **Secrets**: AWS Secrets Manager for API keys and private keys

### Sensitive Data Handling

- PHI (Protected Health Information) encrypted at rest
- Passwords never logged or transmitted in plain text
- Stellar private keys stored in secure enclave
- Credit card data: PCI-DSS compliant (tokenized via Stellar)
- Audit logs sanitized to exclude sensitive fields

### Data Retention

- Patient records: Retained per HIPAA requirements (6 years minimum)
- Audit logs: Retained for 90 days
- Deleted data: Securely wiped using cryptographic erasure
- Right to be forgotten: Data export and deletion available

## API Security

### Input Validation

- All inputs validated with Zod schemas
- File uploads scanned for malware
- File size limits enforced (max 10MB)
- Allowed file types whitelist

### Rate Limiting

- General endpoints: 100 requests per 15 minutes per IP
- Authentication endpoints: 5 attempts per 15 minutes per IP
- Payment endpoints: 10 requests per 15 minutes per user

### CORS Configuration

- Whitelist specific origins (not *)
- Credentials allowed only for trusted origins
- Preflight requests validated

### Security Headers

- Content-Security-Policy (CSP)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security (HSTS)
- X-XSS-Protection

### SQL/NoSQL Injection Prevention

- Parameterized queries via Mongoose
- Input sanitization for regex patterns
- No eval() or Function() with user input

## Incident Response

### Security Incident Reporting

If you discover a security vulnerability:

1. **Do not** publicly disclose the vulnerability
2. Email security@healthwatchers.com with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Your contact information

3. We will:
   - Acknowledge receipt within 24 hours
   - Investigate and assess severity
   - Develop and test a fix
   - Release a patch and security advisory
   - Credit the reporter (if desired)

### Incident Response Plan

- Security incidents logged and tracked
- Incident severity assessed (Critical, High, Medium, Low)
- Affected users notified within 24 hours for Critical/High
- Root cause analysis performed
- Preventive measures implemented

## Compliance

### HIPAA Compliance

- Business Associate Agreement (BAA) in place
- PHI encryption at rest and in transit
- Access controls and audit logging
- Breach notification procedures
- Annual security risk assessment

### GDPR Compliance

- Data processing agreements in place
- Data retention policies enforced
- Right to access, rectification, erasure
- Data portability (export functionality)
- Privacy policy and consent management

### PCI-DSS Compliance

- Credit card data tokenized via Stellar
- No credit card storage on servers
- Secure payment processing
- Regular security assessments

## Security Best Practices

### For Developers

1. **Code Review**: All code reviewed by at least one other developer
2. **Dependency Management**: Keep dependencies up to date, use `npm audit`
3. **Secrets Management**: Never commit secrets, use environment variables
4. **Logging**: Log security events, but never log sensitive data
5. **Testing**: Write security tests for authentication and authorization

### For Operators

1. **Access Control**: Principle of least privilege
2. **Monitoring**: Monitor logs for suspicious activity
3. **Backups**: Regular encrypted backups, test restore procedures
4. **Updates**: Apply security patches promptly
5. **Audits**: Regular security audits and penetration testing

### For Users

1. **Strong Passwords**: Use unique, strong passwords
2. **MFA**: Enable multi-factor authentication
3. **Phishing**: Be cautious of suspicious emails
4. **Reporting**: Report suspicious activity immediately

## Security Checklist

See [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) for detailed OWASP Top 10 assessment and penetration testing checklist.

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [GDPR](https://gdpr-info.eu/)
- [PCI-DSS](https://www.pcisecuritystandards.org/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-27 | Initial security guidelines |

---

**Last Updated**: 2026-05-27  
**Next Review**: 2026-08-27
## HIPAA Breach Notification Procedure

Under 45 CFR §164.400-414, covered entities must notify affected individuals, the
Department of Health and Human Services, and for breaches affecting more than 500
individuals, prominent media outlets within 60 calendar days of breach discovery.

1. Record the breach immediately with `POST /api/v1/admin/breach-incidents`.
2. The system computes `notificationDeadline` as `discoveredAt + 60 days` and
   queues affected-patient notifications.
3. Monitor missed deadlines with `GET /api/v1/admin/breach-incidents/overdue`.
4. Generate the HHS report payload with
   `GET /api/v1/admin/breach-incidents/:id/hhs-report`.
5. Mark the incident `COMPLETE` only after patient, HHS, and required media
   notifications are sent and acknowledged.

Severity levels:

| Level | Action |
| --- | --- |
| LOW | Internal review; notify if PHI was exposed. |
| MEDIUM | Notify patients and HHS within 60 days. |
| HIGH | Notify patients, HHS, and media if more than 500 people are affected. |
| CRITICAL | Escalate immediately to leadership and legal counsel. |
