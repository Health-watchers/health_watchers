# Data Encryption At Rest

All PHI and credentials should be encrypted by the storage layer and by application-level field encryption where required.

## Key References

- `DATA_ENCRYPTION_KEY_REF`: KMS or Vault key reference.
- `DATABASE_URL`: database with encryption-at-rest enabled.
- `BACKUP_ENCRYPTION_KEY_REF`: key reference used for backup artifacts.

Rotate keys with dual-read support and audit every decrypt failure.
