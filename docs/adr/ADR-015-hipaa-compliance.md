# ADR-015: HIPAA Compliance Architecture

## Status

Accepted

## Date

2024-05-20

## Context

Health Watchers stores and processes Protected Health Information (PHI) as defined by the Health Insurance Portability and Accountability Act (HIPAA). The HIPAA Security Rule (45 CFR Part 164) requires covered entities to implement administrative, physical, and technical safeguards to protect ePHI.

Technical safeguard requirements directly relevant to this platform:

| HIPAA Section | Requirement |
|--------------|-------------|
| § 164.312(a)(1) | Access control — unique user identification, automatic logoff |
| § 164.312(a)(2)(iv) | Encryption and decryption of ePHI |
| § 164.312(b) | Audit controls — hardware, software, procedural mechanisms |
| § 164.312(c)(1) | Integrity — protect ePHI from improper alteration or destruction |
| § 164.312(d) | Person or entity authentication |
| § 164.312(e)(1) | Transmission security — encryption in transit |
| § 164.410 | Breach notification — timely notification of breaches |

## Decision

HIPAA compliance is implemented as a cross-cutting concern across multiple system layers. Key decisions are:

### § 164.312(a)(1) — Access Control

- Every API request requires a valid JWT (see ADR-007); no unauthenticated access to PHI endpoints.
- RBAC enforces least-privilege: patients can only access their own records; clinic staff can only access their clinic's data (`clinicId` scoping on every query).
- Session timeout: access tokens expire in 15 minutes; refresh tokens expire in 7 days.
- Account lockout after repeated failed login attempts.

### § 164.312(a)(2)(iv) — PHI Encryption at Rest

- PHI fields encrypted with **AES-256** before MongoDB write.
- Encryption key: `FIELD_ENCRYPTION_KEY` (64-char hex = 32 bytes). Missing in production causes `process.exit(1)`.
- Key versioning: `FIELD_ENCRYPTION_KEY_VERSION` tracks which key version encrypted a given record, enabling key rotation without decrypting all records at once.
- Separate keys for audit logs (`AUDIT_ENCRYPTION_KEY`) and backups (`BACKUP_ENCRYPTION_KEY`).
- Annual key rotation is the recommended cadence; old key versions are retained during migration windows.

### § 164.312(b) — Audit Controls

- `requestAuditMiddleware`: logs every authenticated HTTP request (actor, resource, action, IP, timestamp, requestId).
- `mutationAuditMiddleware`: captures before/after diffs on all PHI-mutating operations (CREATE, UPDATE, DELETE).
- Audit logs are stored in the `auditlogs` MongoDB collection with a 6-year TTL index (configurable via `AUDIT_LOG_RETENTION_YEARS`).
- Audit log entries are encrypted at rest with `AUDIT_ENCRYPTION_KEY`.
- Audit logs are immutable within the application: there is no DELETE endpoint for audit records.

### § 164.312(c)(1) — Data Integrity

- Mongoose schema validation prevents structurally invalid data from reaching the database.
- HTML sanitisation on free-text clinical fields (SOAP notes, chief complaint) prevents stored XSS payloads from corrupting rendered content.
- MongoDB replica set ensures data is not lost due to a single node failure.
- Database backups are encrypted and verified (`backup-verify.yml` CI workflow).

### § 164.312(d) — Authentication

- Unique user IDs enforced by unique index on `users.email`.
- TOTP MFA mandatory for DOCTOR and NURSE roles (the roles with broadest PHI access).
- Password hashing with bcrypt (12 rounds); minimum 32-character JWT secrets.
- Temp tokens (5-min expiry) used for the MFA challenge step to prevent session fixation.

### § 164.312(e)(1) — Transmission Security

- TLS enforced at the NGINX layer; HSTS (`max-age=31536000; includeSubDomains; preload`) prevents downgrade attacks.
- All internal service-to-service calls (API → Stellar Service) travel over TLS-encrypted channels in production.

### § 164.410 — Breach Notification

- SMTP configuration (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) required in production for automated breach notification emails.
- Missing SMTP config in production triggers a startup warning.
- A `breach-incidents` module tracks incident state and notification status.
- `APP_BASE_URL` used to generate breach notification links.

### PHI fields catalogue

The following fields are classified as PHI and encrypted:

| Collection | Fields |
|------------|--------|
| `patients` | `dateOfBirth`, `contactNumber`, `address`, `insurance.policyNumber`, `insurance.groupNumber` |
| `users` | `mfaSecret`, `mfaBackupCodes`, `resetPasswordTokenHash` (select: false, not PHI but sensitive) |

Non-PHI identifiers (`firstName`, `lastName`) are stored in plaintext to enable search; a `searchName` normalised field supports case-insensitive lookup without decrypting.

### Clinical data retention

| Data type | Retention | Basis |
|-----------|-----------|-------|
| Clinical records | 7 years | HIPAA minimum 6 years + 1 year buffer |
| Audit logs | 6 years | HIPAA § 164.312(b) |
| Refresh tokens | 7 days | Session management |

Controlled by TTL indexes; periods configurable via `CLINICAL_RETENTION_YEARS` and `AUDIT_LOG_RETENTION_YEARS`.

### Security training enforcement (§ 164.308(a)(5))

`SECURITY_TRAINING_EXPIRY_DAYS` (default: 365) tracks whether clinic users have completed annual security awareness training. Users with expired training receive warnings; administrators can enforce access restriction.

## Consequences

### Positive

- Hard-exit on missing encryption keys in production makes it impossible to accidentally run with plaintext PHI storage.
- Immutable audit logs with TTL-based retention satisfy § 164.312(b) automatically.
- PHI scrubbing in Sentry and Pino ensures ePHI never reaches third-party systems.
- Mandatory MFA for clinical roles satisfies § 164.312(d) for the highest-risk users.

### Negative / Trade-offs

- AES-256 field encryption prevents direct database queries on encrypted fields (e.g. searching by exact `dateOfBirth`). Application-level search strategies (normalised plaintext fields, app-side filter after decryption) are required.
- Three separate encryption keys increase key-management burden; a secrets manager (AWS Secrets Manager, HashiCorp Vault) is recommended for production.
- HIPAA compliance is a process, not a state; technical controls here satisfy the technical safeguard specification, but administrative and physical safeguards (workforce policies, physical access controls) are also required.

### Neutral

- This ADR documents the technical controls. A complete HIPAA compliance programme requires BAAs with all service providers (MongoDB Atlas, AWS, Sentry, etc.).

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Full-disk encryption only (no field-level encryption) | Does not protect PHI if an attacker gains database-level access with a valid credential |
| MongoDB Atlas Client-Side Field Level Encryption | Requires Atlas and adds vendor lock-in; in-process AES-256 achieves the same and is cloud-agnostic |
| Delegating encryption to a KMS | Adds latency and external dependency for every write; acceptable long-term but not needed at current scale |

## References

- `apps/api/src/config/env.ts` — HIPAA key validation and production hard-exits
- `apps/api/src/middlewares/request-audit.middleware.ts`
- `apps/api/src/middlewares/mutation-audit.middleware.ts`
- `apps/api/src/instrument.ts` — Sentry PHI scrubbing
- `apps/api/src/utils/logger.ts` — Pino PHI redaction
- `docs/SECURITY_POLICY.md`
- `.changeset/feat-consent-management-versioning.md`
- `.changeset/feat-hipaa-data-export.md`
