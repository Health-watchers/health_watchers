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
