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
| Weekly verification | Sundays at 02:00 UTC | — |

Backups are:
1. Dumped with `mongodump`
2. Compressed with `tar + gzip`
3. Encrypted with AES-256-CBC (PBKDF2, 100k iterations)
4. Uploaded to S3 (`s3://$BACKUP_BUCKET/mongodb/`)
5. Stored with `STANDARD_IA` storage class

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
