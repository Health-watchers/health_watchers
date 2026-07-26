# Security & HIPAA Compliance

Health Watchers is designed with HIPAA compliance and security as core principles.

## Authentication

### JWT-Based Authentication

- Access tokens: 15-minute expiration
- Refresh tokens: 7-day expiration with rotation
- Secure token storage in httpOnly cookies
- CSRF protection enabled

### Multi-Factor Authentication

- TOTP (Time-based One-Time Password) support
- SMS verification available
- Backup codes for account recovery

## Authorization (RBAC)

Role-based access control with fine-grained permissions:

| Role | Permissions |
|------|------------|
| SUPER_ADMIN | Full system access |
| CLINIC_ADMIN | Clinic management, user management |
| DOCTOR | Patient records, encounters, prescriptions |
| NURSE | Patient records, vital signs, triage |
| PATIENT | Own records, appointments, payments |

## Data Encryption

### At Rest

- MongoDB encryption at rest
- Sensitive fields encrypted with AES-256
- Encryption keys stored in AWS Secrets Manager

### In Transit

- TLS 1.3 for all API communications
- HTTPS enforced
- Certificate pinning for mobile apps

## HIPAA Compliance

### Privacy Rule

- Patient consent required for data access
- Audit logs for all data access
- Data retention policies enforced
- Patient right to access implemented

### Security Rule

- Access controls and authentication
- Encryption of PHI
- Audit controls and logging
- Integrity controls

### Breach Notification

- Automatic breach detection
- 60-day notification requirement
- Breach log maintained
- Incident response procedures

## Audit Logging

All sensitive operations logged:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "userId": "user_123",
  "action": "VIEW_PATIENT_RECORD",
  "resourceType": "patient",
  "resourceId": "patient_456",
  "status": "success",
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0..."
}
```

## Data Anonymization

For research and analytics:

```typescript
import { anonymizePatient } from '@packages/anonymize';

const anonymized = anonymizePatient(patientRecord);
// Removes: name, DOB, SSN, contact info
// Keeps: age range, gender, diagnoses, treatments
```

## Input Validation & Sanitization

- All inputs validated with Zod schemas
- HTML sanitization for user-generated content
- SQL injection prevention via parameterized queries
- XSS protection via Content Security Policy

## Secrets Management

### Environment Variables

```bash
# Never commit secrets
JWT_ACCESS_TOKEN_SECRET=...
JWT_REFRESH_TOKEN_SECRET=...
STELLAR_CLINIC_SECRET_KEY=...
MONGO_URI=...
```

### AWS Secrets Manager Integration

```typescript
import { getSecret } from '@api/lib/secrets';

const dbPassword = await getSecret('prod/mongo/password');
```

## Compliance Checklist

- [ ] HIPAA Business Associate Agreement (BAA) signed
- [ ] Data Processing Agreement (DPA) in place
- [ ] Regular security audits scheduled
- [ ] Penetration testing completed
- [ ] Incident response plan documented
- [ ] Employee training completed
- [ ] Backup and disaster recovery tested

## Security Best Practices

1. **Keep dependencies updated**
   ```bash
   npm audit
   npm update
   ```

2. **Use strong passwords**
   - Minimum 12 characters
   - Mix of uppercase, lowercase, numbers, symbols

3. **Enable MFA**
   - Required for all admin accounts
   - Recommended for all users

4. **Monitor logs**
   - Set up alerts for suspicious activity
   - Review audit logs regularly

5. **Regular backups**
   - Daily automated backups
   - Test restore procedures

## Reporting Security Issues

Found a vulnerability? Please report to security@healthwatchers.com

Do not open public issues for security vulnerabilities.

## See Also

- [Authentication](./authentication.md)
- [RBAC](./rbac.md)
- [Data Encryption](./data-encryption.md)
