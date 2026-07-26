# Backup Verification System

**Health Watchers — HIPAA-Compliant Backup Testing**

## Overview

The backup verification system automatically tests MongoDB backups weekly to ensure they can be restored and contain valid data. This is a HIPAA best practice and critical for disaster recovery readiness.

**Key Principle:** A backup that cannot be restored is worthless.

## Architecture

### Components

1. **Backup Script** (`scripts/backup-mongodb.sh`)
   - Creates encrypted backups
   - Uploads to S3
   - Enforces retention policy

2. **Verification Script** (`scripts/verify-backup.sh`)
   - Downloads latest backup
   - Decrypts and extracts
   - Restores to temporary MongoDB
   - Validates data integrity
   - Records metrics

3. **GitHub Actions Workflow** (`.github/workflows/backup-verify.yml`)
   - Runs weekly on Sunday at 03:00 UTC
   - Executes verification script
   - Sends alerts on failure
   - Creates GitHub issues
   - Uploads logs and metrics

4. **Metrics Service** (`apps/api/src/services/backup-metrics.service.ts`)
   - Prometheus metrics for monitoring
   - Tracks verification status and timing
   - Detects stale verifications

5. **Health Endpoints** (`apps/api/src/modules/health/backup-health.controller.ts`)
   - `/health/backup` — Quick status check
   - `/health/backup/detailed` — Detailed status with recommendations

## Verification Process

### Step-by-Step Flow

```
1. Find Latest Backup
   ↓
2. Download from S3
   ↓
3. Decrypt (AES-256-CBC)
   ↓
4. Extract (tar + gzip)
   ↓
5. Start Temporary MongoDB
   ↓
6. Restore Backup
   ↓
7. Validate Data Integrity
   ├─ Count documents in critical collections
   ├─ Check for orphaned references
   ├─ Verify indexes are present
   └─ Check for data consistency
   ↓
8. Record Metrics
   ↓
9. Send Alerts (if failed)
   ↓
10. Cleanup
```

### Validation Checks

**Collection Counts:**
- Patients collection
- Users collection
- Encounters collection
- Payments collection

**Data Integrity:**
- No orphaned encounter records (encounters without patients)
- Indexes present on critical collections
- No duplicate records

**Backup Structure:**
- Correct directory structure
- All collections present
- Metadata intact

## Configuration

### Environment Variables

```bash
# Required
MONGO_URI=mongodb://...
BACKUP_ENCRYPTION_KEY=your-encryption-key
BACKUP_BUCKET=your-s3-bucket
AWS_REGION=us-east-1

# Optional
VERIFY_DIR=/tmp/backup-verify
BACKUP_METRICS_FILE=/tmp/backup_verify_metrics.txt
```

### GitHub Actions Secrets

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
MONGO_URI
BACKUP_ENCRYPTION_KEY
BACKUP_BUCKET
SLACK_WEBHOOK_URL (optional)
ALERT_EMAIL (optional)
EMAIL_HOST (optional)
EMAIL_PORT (optional)
EMAIL_USER (optional)
EMAIL_PASS (optional)
EMAIL_FROM (optional)
```

### Workflow Schedule

```yaml
# Weekly verification every Sunday at 03:00 UTC
- cron: '0 3 * * 0'
```

## Monitoring

### Prometheus Metrics

**Gauges:**
- `backup_last_verified_timestamp` — Unix epoch of last successful verification
- `backup_verification_status` — 1=success, 0=failure
- `backup_size_bytes` — Encrypted backup size
- `backup_extracted_size_bytes` — Extracted backup size
- `backup_collection_document_count{collection}` — Document count per collection
- `backup_orphaned_records{collection}` — Orphaned records per collection

**Counters:**
- `backup_verification_attempts_total` — Total verification attempts
- `backup_verification_successes_total` — Successful verifications
- `backup_verification_failures_total` — Failed verifications

**Histograms:**
- `backup_verification_duration_seconds` — Total verification time
- `backup_download_duration_seconds` — S3 download time
- `backup_restore_duration_seconds` — MongoDB restore time

### Health Endpoints

**Quick Status:**
```bash
curl http://localhost:3001/health/backup
```

Response:
```json
{
  "status": "healthy",
  "backup": {
    "lastVerified": "2026-05-27T03:00:00Z",
    "verificationStatus": "success",
    "isStale": false,
    "daysSinceVerification": 0,
    "staleSinceThreshold": 8
  },
  "timestamp": "2026-05-27T10:00:00Z"
}
```

**Detailed Status:**
```bash
curl http://localhost:3001/health/backup/detailed
```

Response:
```json
{
  "status": "healthy",
  "backup": {
    "lastVerified": "2026-05-27T03:00:00Z",
    "verificationStatus": "success",
    "isStale": false,
    "daysSinceVerification": 0,
    "staleSinceThreshold": 8
  },
  "recommendations": [
    "Backup verification is healthy. No action required."
  ],
  "timestamp": "2026-05-27T10:00:00Z"
}
```

### Alert Rules

**Stale Verification (>8 days):**
```yaml
- alert: BackupVerificationStale
  expr: (time() - backup_last_verified_timestamp) > 8 * 24 * 3600
  for: 1h
  annotations:
    summary: "Backup verification is stale"
```

**Verification Failed:**
```yaml
- alert: BackupVerificationFailed
  expr: backup_verification_status == 0
  for: 5m
  annotations:
    summary: "Backup verification failed"
```

**Verification Slow:**
```yaml
- alert: BackupVerificationSlow
  expr: backup_verification_duration_seconds > 1800
  for: 5m
  annotations:
    summary: "Backup verification is taking too long"
```

## Notifications

### Slack Alerts

Sent to `SLACK_WEBHOOK_URL` on:
- ✅ Successful verification (optional)
- ❌ Failed verification
- ⚠️ Stale verification (>8 days)

### Email Alerts

Sent to `ALERT_EMAIL` on:
- ❌ Failed verification
- ⚠️ Stale verification

### GitHub Issues

Created automatically on:
- ❌ Failed verification
- ⚠️ Stale verification

## Manual Verification

### Run Verification Manually

```bash
# Set environment variables
export MONGO_URI="mongodb://..."
export BACKUP_ENCRYPTION_KEY="your-encryption-key"
export BACKUP_BUCKET="your-s3-bucket"
export AWS_REGION="us-east-1"

# Run verification
bash scripts/verify-backup.sh

# Check results
cat /tmp/backup-verify/verify_*.log
cat /tmp/backup_verify_metrics.txt
```

### Trigger Workflow Manually

```bash
# Using GitHub CLI
gh workflow run backup-verify.yml

# Or via GitHub UI
# Go to Actions → Backup Verification → Run workflow
```

## Troubleshooting

### Verification Fails

**Check logs:**
```bash
# View workflow logs
gh run view <run-id> --log

# View local verification log
cat /tmp/backup-verify/verify_*.log
```

**Common issues:**
- Backup file corrupted → Check S3 backup integrity
- Decryption failed → Verify `BACKUP_ENCRYPTION_KEY` is correct
- MongoDB won't start → Check Docker is running, disk space available
- Restore failed → Check MongoDB logs, backup may be incomplete

### Verification is Stale

**Check workflow status:**
```bash
# List recent workflow runs
gh run list --workflow=backup-verify.yml --limit=10

# View latest run
gh run view --workflow=backup-verify.yml
```

**Possible causes:**
- Workflow disabled
- GitHub Actions not running
- Workflow has errors
- Schedule not configured correctly

**Fix:**
```bash
# Enable workflow
gh workflow enable backup-verify.yml

# Manually trigger
gh workflow run backup-verify.yml

# Check schedule in .github/workflows/backup-verify.yml
```

### Metrics Not Updating

**Check metrics file:**
```bash
ls -la /tmp/backup_verify_metrics.txt
cat /tmp/backup_verify_metrics.txt
```

**Check API is loading metrics:**
```bash
# Verify metrics endpoint
curl http://localhost:3001/metrics | grep backup_last_verified_timestamp
```

**Possible causes:**
- Metrics file not being created
- API not loading metrics on startup
- Prometheus scrape interval too long

## Testing

### Test Verification Script

```bash
# Run verification with test data
bash scripts/verify-backup.sh

# Verify output
echo $?  # Should be 0 on success
```

### Test Workflow

```bash
# Trigger workflow manually
gh workflow run backup-verify.yml

# Monitor execution
gh run watch --workflow=backup-verify.yml
```

### Test Alerts

```bash
# Manually trigger failure scenario
# (Modify script to simulate failure for testing)

# Verify Slack notification received
# Verify email notification received
# Verify GitHub issue created
```

## HIPAA Compliance

### Why Backup Verification Matters

1. **Backup Integrity** — Ensures backups are not corrupted
2. **Restore Capability** — Verifies backups can actually be restored
3. **Data Completeness** — Confirms all critical data is present
4. **Audit Trail** — Records verification attempts and results
5. **Incident Readiness** — Ensures DR procedures work when needed

### Compliance Requirements

- ✅ Regular backup testing (weekly)
- ✅ Documented procedures (this document)
- ✅ Automated verification (GitHub Actions)
- ✅ Monitoring and alerting (Prometheus)
- ✅ Audit trail (metrics, logs, GitHub issues)
- ✅ Incident response (alerts, notifications)

### Documentation

- Backup strategy documented in `docs/disaster-recovery.md`
- Verification procedures documented in this file
- Metrics tracked in Prometheus
- Logs stored in GitHub Actions artifacts
- Issues created for failures

## Best Practices

1. **Review Verification Logs Weekly**
   - Check for any warnings or issues
   - Verify metrics are being recorded

2. **Test Restore Procedures**
   - Periodically restore to staging environment
   - Verify data integrity after restore
   - Document any issues found

3. **Monitor Metrics**
   - Set up Prometheus alerts
   - Monitor verification duration trends
   - Alert on stale verifications

4. **Maintain Encryption Keys**
   - Rotate `BACKUP_ENCRYPTION_KEY` annually
   - Store securely in secrets manager
   - Document key rotation procedures

5. **Document Incidents**
   - Record any backup failures
   - Document root cause analysis
   - Update procedures based on findings

6. **Test Disaster Recovery**
   - Quarterly DR drills
   - Test full restore procedures
   - Verify RTO/RPO targets

## References

- [HIPAA Backup Requirements](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [MongoDB Backup Best Practices](https://docs.mongodb.com/manual/core/backups/)
- [AWS S3 Backup Strategy](https://docs.aws.amazon.com/AmazonS3/latest/userguide/backup-restore.html)
- [Disaster Recovery Planning](https://en.wikipedia.org/wiki/Disaster_recovery)
