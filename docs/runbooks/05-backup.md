# Backup Procedures Runbook

**Service:** Health Watchers  
**Database:** MongoDB 7  
**Storage:** AWS S3 (encrypted)  
**Compliance:** HIPAA § 164.312(c)(1) — backup encryption required  
**Last Updated:** 2026-08-30  
**Owner:** Platform Engineering  

---

## Overview

Backups are automated via GitHub Actions (`backup.yml`). Backups use `mongodump` and are encrypted with `BACKUP_ENCRYPTION_KEY` before upload to S3. Retention is 30 days.

---

## Backup Schedule

| Type | Schedule | Retention |
|---|---|---|
| Full backup | Daily at 02:00 UTC | 30 days |
| Incremental backup | Every 6 hours (02:00, 08:00, 14:00, 20:00 UTC) | 30 days |
| Weekly verification | Sundays at 02:00 UTC | Runs restore test, no extra file |

---

## Automated Backup (normal operation)

Backups run automatically. No manual action needed unless:
- A backup failure GitHub issue has been created (see `backup.yml` failure notification)
- You need to verify a backup before a major operation
- You need to perform a manual ad-hoc backup

**Verify last backup status:**
1. GitHub → Actions → **MongoDB Backup** workflow
2. Check the most recent run — it should be green
3. Or check S3: `s3://$BACKUP_BUCKET/backups/`

---

## Manual Ad-hoc Backup

### Option A — GitHub Actions (recommended)

1. Go to **GitHub → Actions → MongoDB Backup**
2. Click **Run workflow**
3. Set **Run restore verification after backup** to `true` if you want to verify
4. Click **Run workflow**

**Time estimate:** 10–20 minutes

---

### Option B — Manual `mongodump`

Use this when GitHub Actions is unavailable or for local/development backups.

```bash
# Prerequisites: mongodump v7.0, aws CLI, openssl

# 1. Set variables
MONGO_URI="mongodb+srv://<user>:<pass>@<host>/<db>"
BACKUP_ENCRYPTION_KEY="<your-32+-char-key>"
BACKUP_BUCKET="<your-s3-bucket>"
AWS_REGION="us-east-1"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
BACKUP_NAME="manual_backup_${TIMESTAMP}"
BACKUP_DIR="/tmp/${BACKUP_NAME}"

# 2. Run mongodump
mongodump --uri="$MONGO_URI" --out="$BACKUP_DIR" --gzip

# 3. Create archive
tar -czf "${BACKUP_DIR}.tar.gz" -C /tmp "$BACKUP_NAME"

# 4. Encrypt archive (AES-256-CBC)
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
  -in "${BACKUP_DIR}.tar.gz" \
  -out "${BACKUP_DIR}.tar.gz.enc" \
  -k "$BACKUP_ENCRYPTION_KEY"

# 5. Upload to S3
aws s3 cp "${BACKUP_DIR}.tar.gz.enc" \
  "s3://${BACKUP_BUCKET}/backups/manual/${BACKUP_NAME}.tar.gz.enc" \
  --region "$AWS_REGION" \
  --sse aws:kms

# 6. Clean up local files
rm -rf "$BACKUP_DIR" "${BACKUP_DIR}.tar.gz" "${BACKUP_DIR}.tar.gz.enc"

echo "Backup complete: s3://${BACKUP_BUCKET}/backups/manual/${BACKUP_NAME}.tar.gz.enc"
```

**Time estimate:** 5–30 minutes depending on database size

---

## Restore Procedure

> **Warning:** Restoring overwrites existing data. Always confirm the target environment. In production, ensure all API pods are scaled down first to prevent writes during restore.

### Pre-restore checklist

- [ ] Confirm target environment (staging vs production)
- [ ] Scale API pods to 0 to prevent writes: `kubectl scale deployment/api --replicas=0 -n health-watchers`
- [ ] Note the S3 path of the backup to restore
- [ ] Confirm `BACKUP_ENCRYPTION_KEY` matches the key used to encrypt the backup

```bash
# 1. Set variables
BACKUP_ENCRYPTION_KEY="<your-key>"
BACKUP_BUCKET="<your-s3-bucket>"
AWS_REGION="us-east-1"
BACKUP_KEY="backups/daily/backup_20260830_020000.tar.gz.enc"  # example
MONGO_URI="mongodb+srv://<user>:<pass>@<host>/<db>"
RESTORE_DIR="/tmp/restore_$(date +%s)"

mkdir -p "$RESTORE_DIR"

# 2. Download encrypted backup from S3
aws s3 cp "s3://${BACKUP_BUCKET}/${BACKUP_KEY}" \
  "${RESTORE_DIR}/backup.tar.gz.enc" \
  --region "$AWS_REGION"

# 3. Decrypt
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in "${RESTORE_DIR}/backup.tar.gz.enc" \
  -out "${RESTORE_DIR}/backup.tar.gz" \
  -k "$BACKUP_ENCRYPTION_KEY"

# 4. Extract
tar -xzf "${RESTORE_DIR}/backup.tar.gz" -C "$RESTORE_DIR"

# 5. Restore with mongorestore
# WARNING: --drop drops existing collections before restoring
mongorestore --uri="$MONGO_URI" \
  --dir="${RESTORE_DIR}/<backup-folder-name>" \
  --gzip \
  --drop

# 6. Verify restore
mongosh "$MONGO_URI" --eval "db.adminCommand({ listDatabases: 1 })"

# 7. Scale API back up
kubectl scale deployment/api --replicas=2 -n health-watchers

# 8. Clean up
rm -rf "$RESTORE_DIR"
```

**Time estimate:** 20–90 minutes depending on database size

---

## Backup Verification

Backup verification runs every Sunday. It:
1. Downloads the latest backup from S3
2. Decrypts and extracts it
3. Restores into a temporary MongoDB instance
4. Runs collection count checks
5. Reports pass/fail

To run verification manually:
1. GitHub → Actions → **MongoDB Backup** → **Run workflow**
2. Enable **Run restore verification after backup** = `true`

---

## S3 Bucket Structure

```
s3://<BACKUP_BUCKET>/
├── backups/
│   ├── daily/
│   │   └── backup_YYYYMMDD_HHMMSS.tar.gz.enc
│   ├── incremental/
│   │   └── backup_YYYYMMDD_HHMMSS.tar.gz.enc
│   └── manual/
│       └── manual_backup_YYYYMMDD_HHMMSS.tar.gz.enc
```

---

## Backup Failure Response

If the backup workflow fails, a GitHub Issue is automatically created with the label `backup, incident`.

1. Go to the failed workflow run and read the error
2. Common causes:
   - `MONGO_URI` secret expired or rotated — update in GitHub Secrets
   - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` expired — rotate IAM credentials
   - `BACKUP_BUCKET` does not exist or IAM lacks `s3:PutObject` permission
   - MongoDB Atlas IP allowlist doesn't include the GitHub Actions runner IPs
3. Fix the root cause
4. Re-run the workflow manually to confirm it passes
5. Close the GitHub Issue

---

## Key Secrets Required

| Secret | Purpose |
|---|---|
| `MONGO_URI` | Database connection string |
| `BACKUP_ENCRYPTION_KEY` | Encrypts the backup file (AES-256) |
| `BACKUP_BUCKET` | S3 bucket name |
| `AWS_ACCESS_KEY_ID` | AWS authentication |
| `AWS_SECRET_ACCESS_KEY` | AWS authentication |
| `AWS_REGION` | AWS region (default: `us-east-1`) |

---

## Related Runbooks

- [Rollback Procedures](./02-rollback.md)
- [Incident Response](./03-incident-response.md)
- [Database Maintenance](./10-database-maintenance.md)
