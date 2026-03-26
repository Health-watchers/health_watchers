# Security

## PHI Field-Level Encryption

Patient records store the following fields encrypted at rest in MongoDB to satisfy
HIPAA Technical Safeguards (45 CFR § 164.312(a)(2)(iv)):

- `contactNumber`
- `address`
- `dateOfBirth`

### Algorithm

AES-256-GCM. Each value is independently encrypted with a random 12-byte IV and
stored as `<iv_hex>:<ciphertext_hex>:<auth_tag_hex>`. The auth tag prevents silent
tampering. Encryption and decryption are handled transparently by Mongoose middleware
in `apps/api/src/modules/patients/patient.model.ts` — API responses always return
plaintext.

### Key Management

The encryption key is a 32-byte (64 hex-character) secret stored in the
`FIELD_ENCRYPTION_KEY` environment variable. It must **never** be committed to
source control.

Generate a new key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

In production, store the key in AWS Secrets Manager (or equivalent) and inject it
as an environment variable at runtime.

### Key Rotation Procedure

1. Generate a new 32-byte key (command above).
2. Set `FIELD_ENCRYPTION_KEY_OLD` to the current key and `FIELD_ENCRYPTION_KEY` to
   the new key in your environment.
3. Run the migration script:
   ```bash
   # Re-encrypts every patient document with the new key.
   # Reads with OLD key, writes with NEW key.
   npx ts-node scripts/rotate-phi-encryption.ts
   ```
4. Verify a sample of records decrypt correctly with the new key.
5. Remove `FIELD_ENCRYPTION_KEY_OLD` from the environment.
6. Revoke / archive the old key in your secrets manager.

> The rotation script (`scripts/rotate-phi-encryption.ts`) must be written before
> performing a live rotation. It should iterate all `Patient` documents, decrypt
> each PHI field with the old key, re-encrypt with the new key, and save.
