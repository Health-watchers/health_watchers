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

## Backup & DR Automation

**Use when:** operating, verifying or troubleshooting the automated backup
pipeline, or preparing for a restore.
**Objective:** daily full backup, ≤1h RPO via oplog incrementals, RTO 30 min,
verification passes on every run, DR tested monthly, storage cost monitored.
**Owner:** DevOps on-call.

> Related: [`DR_DATABASE_RESTORE.md`](./DR_DATABASE_RESTORE.md),
> [`../DISASTER_RECOVERY.md`](../DISASTER_RECOVERY.md),
> [`../BACKUP_VERIFICATION.md`](../BACKUP_VERIFICATION.md).

### 1. What runs when

| Job | Schedule | Script | Result |
|-----|----------|--------|--------|
| Full backup | daily 02:10 UTC | `scripts/backup/backup-scheduler.sh --mode full` | encrypted dump in S3 + checksum verify + GFS retention |
| Oplog incremental | hourly :20 | `scripts/backup/backup-scheduler.sh --mode incremental` | `mongodb/incremental/oplog-*.enc` + advanced checkpoint |
| Restore drill | monthly, 1st 03:00 UTC | `scripts/dr/dr-drill.sh --scope monthly` | RTO/RPO/integrity scorecard, appended to `docs/DR_DRILL_LOG.md` |
| Cost report | weekly Mon 06:00 UTC | `scripts/backup/backup-cost-report.sh` | per-storage-class cost + tiering hints + Pushgateway metric |

Deployed by `k8s/backup/backup-cronjobs.yaml`. `backup-scheduler.sh --mode auto`
(the default) picks full vs incremental from `FULL_BACKUP_HOUR`.

### 2. Backup layout in S3

```
s3://$BACKUP_BUCKET/mongodb/
  20260830_021005.enc            full dump (AES-256-CBC, pbkdf2)
  20260830_021005.enc.sha256     integrity manifest
  incremental/
    _checkpoint.json             last replayed oplog timestamp
    oplog-20260830T032000Z.enc   oplog slice ( > previous checkpoint )
```

The recovery chain for point-in-time is: **newest full dump** + **every oplog
slice with `to_epoch` after that dump**, replayed in order.

### 3. Health checks

```bash
# Newest full backup age (should be < 26h)
aws s3 ls s3://$BACKUP_BUCKET/mongodb/ --region $AWS_REGION | grep -E '\.enc$' | tail -1

# RPO age (should be < 1h)
curl -s $PUSHGATEWAY_URL/metrics | grep 'dr_rpo_age_seconds{source="oplog"'

# Last verification result (1 = pass)
curl -s $PUSHGATEWAY_URL/metrics | grep -E 'backup_checksum_status|backup_run_status'
```

Prometheus alerts: `monitoring/alerts-backup.yml`
(`FullBackupRunMissing`, `IncrementalBackupStalled`, `BackupChecksumVerificationFailed`,
`MonthlyDRTestOverdue`, `BackupRetentionNotEnforced`, `BackupStorageCostSpike`).

### 4. Common failures

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `FullBackupRunMissing` | CronJob not scheduled / node pressure / bad creds | `kubectl -n health-watchers get cronjob mongodb-full-backup`; check last Job's logs; run `backup-scheduler.sh --mode full` manually |
| `BackupChecksumVerificationFailed` | truncated upload, wrong `BACKUP_ENCRYPTION_KEY`, corrupt dump | re-run the full backup; if it re-fails, restore from the previous good backup and open a Sev-2 |
| `IncrementalBackupStalled` | oplog rolled over past the checkpoint, `mongodump` on `local.oplog.rs` denied | verify the backup user has `read` on `local`; if the checkpoint is older than the oplog window, take a fresh full backup (resets the chain) |
| `BackupRetentionNotEnforced` | retention step erroring inside the full job | run `scripts/backup/enforce-retention.sh --dry-run` and inspect |
| `BackupStorageCostSpike` | retention failure or cold objects on STANDARD | `scripts/backup/backup-cost-report.sh`; apply the tiering hint |

### 5. Restore

Use [`DR_DATABASE_RESTORE.md`](./DR_DATABASE_RESTORE.md). Fastest path:

```bash
MONGO_URI="mongodb://<target>/health_watchers" \
BACKUP_BUCKET=$BACKUP_BUCKET BACKUP_ENCRYPTION_KEY=$BACKUP_ENCRYPTION_KEY \
scripts/dr/rto-test.sh --component mongodb --target-seconds 1800

# then replay oplog slices for point-in-time:
for slice in $(aws s3 ls s3://$BACKUP_BUCKET/mongodb/incremental/ --region $AWS_REGION \
                 | awk '{print $4}' | grep '\.enc$' | sort); do
  aws s3 cp "s3://$BACKUP_BUCKET/mongodb/incremental/$slice" /restore/$slice --region $AWS_REGION
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in /restore/$slice \
    -out /restore/${slice%.enc} -pass "pass:$BACKUP_ENCRYPTION_KEY"
  tar -xzf /restore/${slice%.enc} -C /restore/oplog
  mongorestore --uri="$MONGO_URI" --oplogReplay /restore/oplog/local
done
```

### 6. Manual DR test (out of cycle)

```bash
kubectl -n health-watchers create job --from=cronjob/mongodb-restore-drill dr-drill-adhoc
kubectl -n health-watchers logs -f job/dr-drill-adhoc
```

The drill restores into a throwaway target, measures RTO, runs
`scripts/dr/verify-data-integrity.sh`, and appends a row to
`docs/DR_DRILL_LOG.md`. A failed drill pages `health-watchers-oncall`.

### 7. Configuration reference

| Env / ConfigMap key | Default | Meaning |
|---------------------|---------|---------|
| `FULL_BACKUP_HOUR` | `02` | UTC hour `--mode auto` runs the full backup |
| `DAILY_KEEP` / `WEEKLY_KEEP` / `MONTHLY_KEEP` | `7` / `4` / `12` | GFS retention counts |
| `GLACIER_AFTER_DAYS` | `30` | retained objects older than this are tiered to `GLACIER_IR` |
| `DR_BACKUP_BUCKET` | – | cross-region copy target (see `ops/backup/geo-redundant-backup.sh`) |
| `PUSHGATEWAY_URL` | – | where every job pushes its run metrics |
| `BACKUP_ENCRYPTION_KEY` | – | AES-256 passphrase; **rotating it breaks restores of older backups** |

---

## Related Runbooks

- [Rollback Procedures](./02-rollback.md)
- [Incident Response](./03-incident-response.md)
- [Database Maintenance](./10-database-maintenance.md)
