# Disaster Recovery Runbook

**Health Watchers — HIPAA-Compliant EMR**

| Attribute | Value |
|-----------|-------|
| RTO (Recovery Time Objective) | < 4 hours |
| RPO (Recovery Point Objective) | < 6 hours (incremental backup interval) |
| Last reviewed | 2026-04-23 |
| Owner | DevOps / Engineering Lead |

---

## Backup Strategy

| Type | Schedule | Retention |
|------|----------|-----------|
| Full backup | Daily at 02:00 UTC | 30 days |
| Incremental backup | Every 6 hours (02:00, 08:00, 14:00, 20:00 UTC) | 7 days |
| **Backup verification** | **Sundays at 03:00 UTC** | **— (weekly)** |

Backups are:
1. Dumped with `mongodump`
2. Compressed with `tar + gzip`
3. Encrypted with AES-256-CBC (PBKDF2, 100k iterations)
4. Uploaded to S3 (`s3://$BACKUP_BUCKET/mongodb/`)
5. Stored with `STANDARD_IA` storage class

### Backup Verification (HIPAA Best Practice)

**Why it matters:** A backup that cannot be restored is worthless. Regular restore tests are required to ensure backup integrity and meet HIPAA compliance requirements.

**Verification Process:**
1. **Download** latest backup from S3
2. **Decrypt** using AES-256-CBC
3. **Extract** and validate structure
4. **Restore** to temporary MongoDB container
5. **Validate** data integrity:
   - Check critical collections (patients, users, encounters, payments)
   - Verify no orphaned references
   - Confirm indexes are present
6. **Record metrics** for monitoring and alerting

**Automated Verification:**
- Runs weekly via `.github/workflows/backup-verify.yml`
- Sends Slack/email alerts on failure
- Creates GitHub issues for investigation
- Tracks metrics in Prometheus

**Manual Verification:**
```bash
# Run backup verification manually
bash scripts/verify-backup.sh
```

**Monitoring:**
- Prometheus metric: `backup_last_verified_timestamp`
- Alert fires if verification hasn't run in 8 days
- Health check: `GET /health/backup`
- Detailed status: `GET /health/backup/detailed`

---

## Required Secrets

Add these to GitHub Actions secrets and your production `.env`:

| Secret | Description |
|--------|-------------|
| `MONGO_URI` | MongoDB connection string |
| `BACKUP_ENCRYPTION_KEY` | AES-256 encryption passphrase (min 32 chars) |
| `BACKUP_BUCKET` | S3 bucket name for backups |
| `AWS_ACCESS_KEY_ID` | AWS IAM key with S3 read/write access |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret |
| `AWS_REGION` | AWS region (default: `us-east-1`) |
| `SLACK_WEBHOOK_URL` | Slack webhook for backup alerts (optional) |
| `ALERT_EMAIL` | Email address for backup failure alerts (optional) |
| `EMAIL_HOST` | SMTP host for email notifications |
| `EMAIL_PORT` | SMTP port for email notifications |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASS` | SMTP password |
| `EMAIL_FROM` | From address for alert emails |

---

## Disaster Scenarios & Recovery Procedures

### Scenario 1: Accidental Data Deletion

**Symptoms:** Missing patient records, empty collections.

**Steps:**
1. Immediately stop write traffic to the affected database (scale down API pods or set maintenance mode).
2. Identify the last known-good backup timestamp from S3:
   ```bash
   aws s3 ls s3://$BACKUP_BUCKET/mongodb/ --region $AWS_REGION | sort | tail -20
   ```
3. Download and decrypt the backup:
   ```bash
   TIMESTAMP=20260423_020000  # replace with target timestamp
   aws s3 cp s3://$BACKUP_BUCKET/mongodb/$TIMESTAMP.enc /tmp/$TIMESTAMP.enc
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
     -in /tmp/$TIMESTAMP.enc -out /tmp/$TIMESTAMP.tar.gz \
     -pass "pass:$BACKUP_ENCRYPTION_KEY"
   tar -xzf /tmp/$TIMESTAMP.tar.gz -C /tmp/restore/
   ```
4. Restore to a staging MongoDB instance first to verify data integrity:
   ```bash
   mongorestore --uri="$STAGING_MONGO_URI" /tmp/restore/$TIMESTAMP/ --drop
   ```
5. Verify critical collections (patients, encounters, payments) are intact.
6. Restore to production:
   ```bash
   mongorestore --uri="$MONGO_URI" /tmp/restore/$TIMESTAMP/ --drop
   ```
7. Restart API services and verify health endpoint: `GET /health`
8. Document the incident in the audit log.

**Estimated time:** 1–2 hours

---

### Scenario 2: Database Server Failure

**Symptoms:** API returns 500 errors, MongoDB connection refused.

**Steps:**
1. Check MongoDB Atlas status (if using Atlas) or EC2/container health.
2. If using MongoDB Atlas:
   - Enable point-in-time recovery from Atlas UI.
   - Restore to a new cluster or the same cluster at a specific timestamp.
3. If self-hosted:
   - Provision a new MongoDB instance (use `docker-compose.dev.yml` for quick spin-up).
   - Follow Scenario 1 steps 3–7 to restore from S3 backup.
4. Update `MONGO_URI` in environment/secrets to point to the new instance.
5. Restart all API instances.

**Estimated time:** 2–4 hours

---

### Scenario 3: Full Application Outage

**Symptoms:** All services down (API, web, stellar-service).

**Steps:**
1. Check infrastructure (Docker, Kubernetes, EC2) health.
2. Restore database first (see Scenario 2).
3. Redeploy application from last known-good Docker image:
   ```bash
   docker-compose -f docker-compose.prod.yml pull
   docker-compose -f docker-compose.prod.yml up -d
   ```
4. Verify all services:
   - API: `GET /health` → `{ "status": "ok" }`
   - Web: `GET /` → HTTP 200
   - Stellar service: `GET /health` → HTTP 200
5. Run smoke tests against critical endpoints.
6. Notify stakeholders.

**Estimated time:** 2–4 hours

---

### Scenario 4: Ransomware / Security Breach

**Steps:**
1. **Immediately isolate** affected systems (revoke network access, rotate all secrets).
2. Rotate all secrets: `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, `FIELD_ENCRYPTION_KEY`, database credentials.
3. Invalidate all active JWT tokens (change JWT secrets forces re-login for all users).
4. Restore from a backup predating the breach (coordinate with security team on timeline).
5. Conduct forensic analysis before bringing systems back online.
6. Notify affected patients per HIPAA Breach Notification Rule (within 60 days).
7. File required reports with HHS Office for Civil Rights.

---

## Manual Backup

To run a backup manually:

```bash
# Set required env vars
export MONGO_URI="mongodb://..."
export BACKUP_ENCRYPTION_KEY="your-encryption-key"
export BACKUP_BUCKET="your-s3-bucket"

# Run backup
bash scripts/backup-mongodb.sh

# Run backup with restore verification
bash scripts/backup-mongodb.sh --verify
```

---

## Backup Verification Procedures

### Automated Weekly Verification

The `.github/workflows/backup-verify.yml` workflow runs every Sunday at 03:00 UTC (1 hour after the daily backup).

**What it does:**
1. Downloads the latest backup from S3
2. Decrypts using AES-256-CBC
3. Extracts and validates structure
4. Starts a temporary MongoDB container
5. Restores the backup
6. Runs validation queries:
   - Counts documents in critical collections
   - Checks for orphaned references
   - Verifies indexes are present
7. Records metrics for monitoring
8. Sends alerts if verification fails

**Alerts:**
- **Slack notification** on failure (if `SLACK_WEBHOOK_URL` configured)
- **Email notification** on failure (if `ALERT_EMAIL` configured)
- **GitHub issue** created for investigation
- **Prometheus metric** updated: `backup_last_verified_timestamp`

### Manual Verification

To run backup verification manually:

```bash
# Set required env vars
export MONGO_URI="mongodb://..."
export BACKUP_ENCRYPTION_KEY="your-encryption-key"
export BACKUP_BUCKET="your-s3-bucket"
export AWS_REGION="us-east-1"

# Run verification
bash scripts/verify-backup.sh

# Check metrics
cat /tmp/backup_verify_metrics.txt
```

### Monitoring Backup Verification

**Health Check Endpoints:**

```bash
# Quick status check
curl http://localhost:3001/health/backup

# Detailed status with recommendations
curl http://localhost:3001/health/backup/detailed
```

**Prometheus Metrics:**

```
# Last successful verification timestamp
backup_last_verified_timestamp

# Verification status (1=success, 0=failure)
backup_verification_status

# Backup size in bytes
backup_size_bytes

# Extracted backup size in bytes
backup_extracted_size_bytes

# Document counts by collection
backup_collection_document_count{collection="patients"}
backup_collection_document_count{collection="users"}

# Orphaned records detected
backup_orphaned_records{collection="encounters"}

# Verification attempt counters
backup_verification_attempts_total
backup_verification_successes_total
backup_verification_failures_total

# Verification duration histograms
backup_verification_duration_seconds
backup_download_duration_seconds
backup_restore_duration_seconds
```

**Prometheus Alert Rules:**

```yaml
# Alert if backup verification hasn't run in 8 days
- alert: BackupVerificationStale
  expr: (time() - backup_last_verified_timestamp) > 8 * 24 * 3600
  for: 1h
  annotations:
    summary: "Backup verification is stale (>8 days)"
    description: "Last successful backup verification was {{ $value | humanizeDuration }} ago"

# Alert if last verification failed
- alert: BackupVerificationFailed
  expr: backup_verification_status == 0
  for: 5m
  annotations:
    summary: "Backup verification failed"
    description: "The last backup verification attempt failed. Investigate immediately."

# Alert if verification takes too long
- alert: BackupVerificationSlow
  expr: backup_verification_duration_seconds > 1800
  for: 5m
  annotations:
    summary: "Backup verification is taking too long"
    description: "Verification duration: {{ $value | humanizeDuration }}"
```

### Troubleshooting Verification Failures

**"Backup structure invalid"**
- Backup may be corrupted
- Check S3 backup file integrity
- Try restoring from an older backup

**"MongoDB failed to start"**
- Docker daemon may not be running
- Check available disk space
- Verify Docker is installed and running

**"Restore failed"**
- Backup may be incomplete
- Check MongoDB logs in temporary container
- Verify backup encryption key is correct

**"Orphaned records detected"**
- Data integrity issue in backup
- Investigate which collections have orphaned records
- May indicate corruption during backup

**"Verification hasn't run in 8 days"**
- Check `.github/workflows/backup-verify.yml` is enabled
- Verify GitHub Actions is running
- Check workflow logs for errors
- Manually trigger verification: `gh workflow run backup-verify.yml`

---

## MongoDB Atlas (Recommended for Production)

If using MongoDB Atlas, enable:
- **Continuous Cloud Backup** — point-in-time recovery up to 7 days
- **Cross-region backup replication** — for geographic redundancy
- **Backup compliance policy** — enforces retention and prevents deletion

Atlas PITR restore:
1. Go to Atlas → Clusters → Backup → Restore
2. Select "Point in Time" and choose the target timestamp
3. Restore to a new cluster, verify, then promote to production

---

## Post-Recovery Checklist

- [ ] All API health checks passing
- [ ] Patient records accessible and complete
- [ ] Encounter and lab result data intact
- [ ] Payment records verified
- [ ] Audit logs show no unauthorized access
- [ ] All secrets rotated (if breach suspected)
- [ ] Incident documented in internal incident log
- [ ] HIPAA breach assessment completed (if PHI was exposed)
- [ ] Backup schedule re-enabled and verified
