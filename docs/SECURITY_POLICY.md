# Security Policy

## Table of Contents

- [Threat Model](#threat-model)
- [Security Guidelines](#security-guidelines)
- [Incident Response](#incident-response)
- [Vulnerability Reporting](#vulnerability-reporting)
- [Security Checklist](#security-checklist)

## Threat Model

### Assets

1. **Patient Health Information (PHI)**
   - Medical records, diagnoses, medications
   - Lab results, vital signs
   - Personally Identifiable Information (PII)

2. **Payment Information**
   - Stellar blockchain transactions
   - Billing records
   - Insurance details

3. **User Credentials**
   - Login credentials
   - API keys
   - JWT tokens

4. **Infrastructure**
   - Database servers
   - Application servers
   - Message queues

### Threats

#### Data Breaches

**Risk:** Unauthorized access to PHI/PII

**Mitigation:**
- End-to-end encryption for sensitive data
- Database-level encryption at rest
- TLS 1.3 for data in transit
- Network segmentation with VPCs
- Access controls (RBAC)
- Audit logging of all data access

**Detection:**
- Monitor failed authentication attempts
- Alert on unusual data access patterns
- Database activity monitoring (DAM)

#### Credential Compromise

**Risk:** Attacker gains access via stolen credentials

**Mitigation:**
- Enforce MFA (TOTP/U2F)
- Rate limiting on login endpoints
- Password complexity requirements
- Automatic session expiration
- Rotate service credentials regularly
- Secrets management (AWS Secrets Manager)

**Detection:**
- Alert on failed login spikes
- Monitor geographic anomalies
- Track privilege escalation attempts

#### Injection Attacks

**Risk:** NoSQL/SQL injection, command injection

**Mitigation:**
- Input validation with Joi/Zod
- Parameterized queries (no string concatenation)
- ORM layer (Mongoose)
- Content Security Policy (CSP) headers
- HTML escaping in templates

**Detection:**
- WAF rules
- SIEM alerts for injection patterns
- Regular security testing

#### API Security

**Risk:** Unauthorized API access, data exfiltration

**Mitigation:**
- API key rotation
- Rate limiting per user/IP
- JWT token expiration
- CSRF protection (double-submit cookies)
- API versioning
- Whitelist allowed origins (CORS)

**Detection:**
- Monitor API usage anomalies
- Track failed auth attempts
- Alert on bulk data exports

#### Infrastructure Compromise

**Risk:** Attacker gains server access

**Mitigation:**
- Keep systems patched (automated updates)
- Network firewalls and security groups
- Disable unnecessary ports/services
- SSH key-based auth (no passwords)
- Run with least privilege (non-root)
- Security hardening (CIS benchmarks)

**Detection:**
- Failed SSH login monitoring
- Unauthorized port access alerts
- File integrity monitoring

#### Denial of Service (DoS)

**Risk:** Service unavailability

**Mitigation:**
- Rate limiting
- DDoS protection (AWS Shield/CloudFlare)
- Auto-scaling
- Database connection pooling
- API throttling
- Request validation

**Detection:**
- Traffic anomaly detection
- Alert on spike in error rates
- Monitor CPU/memory usage

### Data Classification

| Level | Examples | Protection |
|-------|----------|-----------|
| Public | API documentation, status pages | No encryption |
| Internal | Logs, config files | Encryption at rest |
| Confidential | Patient records, payments | End-to-end encryption |
| Restricted | Master keys, DB credentials | Hardware security module (HSM) |

## Security Guidelines

### Authentication

#### Multi-Factor Authentication (MFA)

**Enforce for:**
- All administrative accounts
- Healthcare provider accounts
- Clinic admin accounts

**Supported Methods:**
- Time-based One-Time Password (TOTP) - Authenticator app
- U2F Security Keys
- SMS (fallback only)

**Implementation:**
```typescript
// Enable MFA for user
await mfaService.enableMFA(userId, {
  method: 'totp',
  backupCodes: generateBackupCodes()
});

// Verify MFA during login
const mfaValid = await mfaService.verify(userId, otpCode);
```

#### Session Management

**Token Lifetime:**
- Access Token: 1 hour
- Refresh Token: 7 days
- Session: 30 minutes of inactivity

**Token Rotation:**
```typescript
// Rotate on each refresh
const newTokens = await tokenService.refresh(refreshToken);
// Old refresh token invalidated
```

### Authorization

#### Role-Based Access Control (RBAC)

**Roles:**
- `admin` - System administration
- `clinic_admin` - Clinic management
- `provider` - Healthcare provider
- `staff` - Clinical staff
- `patient` - Patient portal access

**Implementation:**
```typescript
// Check authorization
app.use(requireRole(['provider', 'clinic_admin']));

// Fine-grained permissions
async function canAccessPatient(userId: string, patientId: string) {
  const provider = await getProvider(userId);
  return provider.clinicId === patient.clinicId;
}
```

### Data Encryption

#### Encryption at Rest

**Database:**
- MongoDB encryption at rest enabled
- Separate encryption key per collection
- Key rotation quarterly

**Backups:**
- Encrypted with separate key
- Stored in secure S3 bucket
- Key in AWS Secrets Manager

**Code:**
```typescript
// Encrypt PHI before storage
const encrypted = encryptPHI(patientData, encryptionKey);
await db.collection('patients').insertOne(encrypted);

// Decrypt when needed
const decrypted = decryptPHI(patient, encryptionKey);
```

#### Encryption in Transit

**HTTPS/TLS:**
- TLS 1.3 minimum
- Strong cipher suites only
- Certificate pinning for mobile apps

**Stellar Transactions:**
- All signed before transmission
- Keypair encrypted in HSM
- Multi-sig transactions for large payments

**Configuration:**
```typescript
// Enforce HTTPS
app.use(helmet.hsts({
  maxAge: 31536000,
  includeSubDomains: true,
  preload: true
}));
```

### API Security

#### Input Validation

```typescript
// Validate all inputs
const patientSchema = Joi.object({
  firstName: Joi.string().max(100).required(),
  lastName: Joi.string().max(100).required(),
  dateOfBirth: Joi.date().required(),
  email: Joi.string().email().required()
});

// Apply validation middleware
app.post('/patients', validate(patientSchema), createPatient);
```

#### Output Encoding

```typescript
// Escape HTML in responses
res.json({
  data: sanitizeOutput(patient)
});

// Content-Type header
res.setHeader('Content-Type', 'application/json');
```

#### CORS Policy

```typescript
// Strict CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
```

### Secrets Management

#### Environment Variables

**Never commit secrets:**
```bash
# .gitignore
.env
.env.local
.env.*.local
*.pem
*.key
```

**Use AWS Secrets Manager:**
```typescript
const secretsClient = new AWS.SecretsManager();

const secret = await secretsClient.getSecretValue({
  SecretId: 'health-watchers/prod/db-password'
}).promise();
```

#### Key Rotation

- **JWT Secrets:** Quarterly
- **Database Credentials:** Monthly
- **API Keys:** Quarterly
- **Stellar Keypairs:** On each transaction type change

**Automated Rotation:**
```bash
# Kubernetes CronJob
apiVersion: batch/v1
kind: CronJob
metadata:
  name: key-rotation
spec:
  schedule: "0 2 1 * *"  # Monthly
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: rotate-keys
            image: health-watchers-api:latest
            command: ["npm", "run", "rotate-secrets"]
```

### Audit Logging

#### What to Log

- User authentication (success/failure)
- Authorization checks (granted/denied)
- Data access (view, modify, delete)
- Configuration changes
- Administrative actions
- API usage anomalies

#### Implementation

```typescript
// Log all mutations
app.post('/patients/:id', async (req, res) => {
  await auditLog.create({
    userId: req.user.id,
    action: 'PATIENT_UPDATE',
    resourceId: req.params.id,
    changes: req.body,
    timestamp: new Date(),
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
});
```

#### Retention Policy

- Live logs: 30 days in application
- Archived logs: 7 years in S3 (HIPAA requirement)
- Log aggregation: AWS CloudWatch / ELK

## Incident Response

### Incident Classification

| Level | Examples | Response Time |
|-------|----------|---|
| Critical | Data breach, ransomware | 1 hour |
| High | System compromise, DoS attack | 4 hours |
| Medium | Unauthorized access attempt | 1 day |
| Low | Security misconfiguration | 1 week |

### Response Procedures

#### 1. Detection & Assessment

```
├── Alert received
├── Verify authenticity
├── Assess scope
├── Determine classification
└── Notify stakeholders
```

**Notification Chain:**
1. Security team
2. DevOps/Infrastructure
3. Executive leadership
4. Legal & Compliance (if data breach)

#### 2. Containment

**Short-term:**
- Isolate affected systems
- Revoke compromised credentials
- Block malicious IPs
- Preserve evidence

**Code:**
```bash
# Revoke all active sessions
db.sessions.deleteMany({ userId: suspectedUserId });

# Rotate credentials
npm run rotate-credentials

# Check integrity
npm run verify-signatures
```

#### 3. Investigation

- Review audit logs
- Analyze forensics
- Determine root cause
- Identify affected data

**Questions:**
- When did the incident start?
- How did the attacker gain access?
- What systems were compromised?
- What data was accessed?

#### 4. Recovery

- Apply patches
- Restore from clean backups
- Verify system integrity
- Re-enable access

#### 5. Post-Incident

- Root cause analysis
- Implement preventive controls
- Update security policies
- Communicate findings

### Incident Notification

**For Data Breaches (HIPAA):**
- Notify affected individuals within 60 days
- Notify HHS if >= 500 residents
- Document notification process
- Preserve evidence for investigation

**Template:**
```
Subject: Important Security Notice

Dear [Patient],

We discovered that [DESCRIPTION] on [DATE].

What happened:
[DETAILS]

What information was involved:
[DATA TYPES]

What we're doing:
[REMEDIATION STEPS]

What you should do:
[RECOMMENDED ACTIONS]

Resources:
[LINKS TO CREDIT MONITORING, ETC]
```

## Vulnerability Reporting

### Report Security Issues

**DO NOT:**
- Create public GitHub issues
- Post on social media
- Share with competitors
- Publicly disclose the vulnerability

**DO:**
- Email: security@healthwatchers.com
- Include: steps to reproduce, impact assessment, suggested fix
- Sign with PGP key (optional)

### Responsible Disclosure Policy

1. **Report** vulnerability to security@healthwatchers.com
2. **Wait** for acknowledgment (within 24 hours)
3. **Work with us** to develop a fix (typically 30 days)
4. **Coordinate** public disclosure date
5. **Receive** credit and swag

### Scope

**In Scope:**
- Authentication bypass
- Authorization flaws
- Injection attacks
- Data exposure
- Cryptographic weaknesses
- Server-side vulnerabilities

**Out of Scope:**
- Social engineering
- Physical security issues
- XSRF on public forms
- Publicly disclosed vulnerabilities
- Issues with dependencies
- Performance issues

## Security Checklist

### Pre-Deployment

- [ ] Dependencies vulnerability scan (`npm audit`)
- [ ] SAST scan (SonarCloud)
- [ ] DAST scan (OWASP ZAP)
- [ ] Code review completed
- [ ] Security tests passing
- [ ] Secrets not in code
- [ ] Encryption enabled
- [ ] MFA enforced for admins

### Infrastructure

- [ ] TLS 1.3 enabled
- [ ] Security groups configured
- [ ] WAF rules deployed
- [ ] DDoS protection enabled
- [ ] Backup encryption verified
- [ ] Monitoring alerts set
- [ ] Logging enabled
- [ ] SSH key rotation scheduled

### Application

- [ ] Rate limiting enforced
- [ ] Input validation enabled
- [ ] Output encoding applied
- [ ] CSRF protection active
- [ ] CSP headers set
- [ ] Session timeout configured
- [ ] Password policy enforced
- [ ] Audit logging working

### Compliance

- [ ] HIPAA compliance verified
- [ ] Data retention policies enforced
- [ ] Privacy policy up to date
- [ ] Business Associate Agreements (BAA) signed
- [ ] Security audit scheduled
- [ ] Incident response plan documented
- [ ] Penetration testing completed
- [ ] Vulnerability management process active

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [AWS Security Best Practices](https://aws.amazon.com/security/best-practices/)
- [CIS Controls](https://www.cisecurity.org/cis-controls/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

## Contact

- **Security Team:** security@healthwatchers.com
- **DevOps:** devops@healthwatchers.com
- **Compliance:** compliance@healthwatchers.com
