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
