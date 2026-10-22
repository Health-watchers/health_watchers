# Disaster Recovery

Canonical disaster recovery (DR) reference for Health Watchers: objectives, backup strategy, failure scenarios, drills, and day-to-day backup operations. Step-by-step runbooks for individual scenarios live in [`runbooks/`](./runbooks/README.md).

| Attribute | Value |
|-----------|-------|
| Platform RTO | 30 min (critical path: API + MongoDB) |
| Platform RPO | 5 min (continuous oplog) / 6 h (incremental archive floor) |
| Backup storage | S3 `us-east-1` primary + `eu-west-1` geo-redundant replica, object-lock |
| Restore test cadence | Monthly (automated) + quarterly full drill (assisted) |
| Owner | DevOps / Platform Engineering |
| Escalation | PagerDuty `health-watchers-oncall` → Engineering Lead → CTO |

## Executive Summary

This document outlines the Disaster Recovery (DR) procedures for the Health Watchers healthcare management platform. It defines Recovery Time Objectives (RTO), Recovery Point Objectives (RPO), backup strategies, and recovery procedures.

## 1. Recovery Objectives

### 1.1 Recovery Time Objective (RTO)

| Component | RTO | Priority |
|-----------|-----|----------|
| API Server | 15 minutes | Critical |
| Web Application | 30 minutes | High |
| MongoDB Database | 30 minutes | Critical |
| Redis Cache | 5 minutes | Medium |
| Stellar Service | 60 minutes | Medium |

### 1.2 Recovery Point Objective (RPO)

| Component | RPO | Backup Strategy |
|-----------|-----|-----------------|
| MongoDB (Production) | **< 5 minutes** | Daily full backup + continuous oplog archiving (PITR) |
| MongoDB (Staging) | 24 hours | Daily full backup |
| Application Code | N/A | On every commit (Git) |
| Configuration | 30 minutes | On every deploy |
| Secrets | Real-time | Centralized secret manager |

**Note:** MongoDB Production uses Point-in-Time Recovery (PITR) with continuous oplog archiving every 5 minutes, enabling restore to any point in time with minimal data loss.

## 2. Backup Strategy

### 2.1 Database Backups

**MongoDB Production - Point-in-Time Recovery (PITR)**

The production MongoDB database uses a comprehensive PITR strategy combining full backups with continuous oplog archiving:

- **Full Backups:**
  - Type: Complete database dump with compression and encryption
  - Frequency: Daily at 2 AM UTC
  - Retention: 30 days
  - Storage: AWS S3 with cross-region replication (us-east-1 → us-west-2)
  - Encryption: AES-256-CBC with PBKDF2 (100,000 iterations)
  
- **Oplog Archives (Continuous):**
  - Type: MongoDB oplog (operation log) segments
  - Frequency: Every 5 minutes
  - Retention: 7 days (aligns with full backup retention for PITR window)
  - Storage: AWS S3 Standard-IA
  - Encryption: AES-256-CBC with PBKDF2 (100,000 iterations)

- **Recovery Capability:**
  - Restore to any point in time within the last 7 days
  - RPO: < 5 minutes (time between oplog archives)
  - RTO: 20-30 minutes for PITR restore

**Backup Command (Full):**
```bash
bash scripts/backup-mongodb.sh
```

**Backup Command (Oplog):**
```bash
bash scripts/backup-mongodb-oplog.sh
```

**PITR Restore Command:**
```bash
bash scripts/restore-mongodb-pitr.sh --timestamp "2024-01-15T14:30:00Z" [--target-uri mongodb://...]
```

**MongoDB Staging**
- Type: Daily full backups only (no PITR)
- Retention: 7 full backups (7 days)
- Storage: AWS S3 (single region)
- Frequency: Daily at 3 AM UTC

**Standard Restore Command (from full backup):**
```bash
mongorestore --archive="health-watchers-backup.archive" --drop
```

### 2.2 Application Code

- Primary: Git repository with protected main branch
- Secondary: Automated tags on each production deploy
- Retention: All commits indefinitely

### 2.3 Configuration Backups

- EBS snapshots for instance configurations
- Version control for IaC (Helm, Kubernetes manifests)
- AWS Secrets Manager for sensitive data

### 2.4 Verification

All backups are verified automatically:
```bash
npm run backup:verify --workspace=api
```

Verification includes:
- Backup file integrity check
- Size validation
- Recovery test on staging environment

## 3. Failure Scenarios & Recovery Procedures

### 3.1 Database Corruption (RTO: 20-30 minutes)

**Detection:**
- MongoDB replication lag exceeds 10 seconds
- Backup integrity checks fail
- Data consistency errors in logs
- Unexpected data loss reported by users

**Recovery Steps:**

**Option 1: Point-in-Time Recovery (Preferred)**
1. Identify the corruption timeline and determine target restore point
2. Stop all write operations: `kubectl scale deployment api --replicas=0`
3. Identify target timestamp (e.g., 5 minutes before corruption detected)
4. Execute PITR restore:
   ```bash
   bash scripts/restore-mongodb-pitr.sh \
     --timestamp "2024-01-15T14:30:00Z" \
     --target-uri "$MONGO_URI"
   ```
5. Validate data integrity:
   ```bash
   mongosh "$MONGO_URI" --eval "db.patients.countDocuments()"
   ```
6. Resume API: `kubectl scale deployment api --replicas=3`
7. Monitor application health and error rates
8. Validate critical user workflows

**Option 2: Full Backup Restore (Fallback)**
1. Stop all write operations: `kubectl scale deployment api --replicas=0`
2. List available backups: `aws s3 ls s3://backups/mongodb/`
3. Restore from latest clean backup:
   ```bash
   # Download and decrypt
   aws s3 cp s3://backups/mongodb/20240115_020000.enc backup.enc
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
     -in backup.enc -out backup.tar.gz \
     -pass "pass:$BACKUP_ENCRYPTION_KEY"
   tar -xzf backup.tar.gz
   
   # Restore
   mongorestore --uri="$MONGO_URI" ./20240115_020000 --drop
   ```
4. Run database integrity checks
5. Resume API: `kubectl scale deployment api --replicas=3`
6. Validate application health checks pass

**Expected Data Loss:**
- PITR: < 5 minutes (up to last oplog archive)
- Full restore: Up to 24 hours (since last full backup)

### 3.2 API Server Failure (RTO: 15 minutes)

**Detection:**
- Health check endpoint returns 503
- Pod crashes or restarts repeatedly
- High error rate (>5% of requests)

**Recovery Steps:**
1. Check pod status: `kubectl get pods -l app=api`
2. View logs: `kubectl logs deployment/api --tail=200`
3. Trigger rollback: `kubectl rollout undo deployment/api`
4. Or redeploy: `helm upgrade health-watchers ./helm/health-watchers`
5. Verify endpoints: `curl https://api.health-watchers.app/health`

### 3.3 Complete Data Center Failure (RTO: 60 minutes)

**Detection:**
- All services unreachable
- Regional AWS outage confirmed

**Recovery Steps:**
1. Activate secondary region
2. Restore databases from cross-region backup
3. Deploy applications to secondary region
4. Update DNS/Route53 to secondary region
5. Verify critical paths functioning
6. Communicate outage to users

### 3.4 Secrets Compromise (RTO: 5 minutes)

**Detection:**
- Unauthorized access logs detected
- Secret exposure in logs/git history

**Recovery Steps:**
1. Rotate all secrets in AWS Secrets Manager
2. Redeploy all pods to pick up new secrets: `kubectl rollout restart deployment/api`
3. Update external integrations (Stellar, email services)
4. Audit access logs and revoke compromised tokens
5. Review commit history for accidental secret exposure

## 4. Disaster Recovery Tests

### 4.1 Monthly Test Schedule

- **Week 1:** Database full backup restoration test
- **Week 2:** API failover test + PITR restore test (restore to specific timestamp)
- **Week 3:** Configuration rollback test + Oplog archive integrity check
- **Week 4:** Full application restore test + Cross-region failover simulation

### 4.2 Quarterly PITR Drill

Test Point-in-Time Recovery capability:
1. Identify a specific timestamp from the past week
2. Restore database to a staging environment at that exact timestamp
3. Validate data consistency and application functionality
4. Measure recovery time and document findings
5. Compare expected vs actual data state

### 4.3 Annual Comprehensive Test

Complete test of all systems simulating total failure:
- Restore database from archive using PITR
- Deploy all services from scratch
- Run full test suite
- Validate data integrity and PITR accuracy
- Test failover procedures
- Verify cross-region replication

### 4.4 Test Results

Results are tracked in `/docs/disaster-recovery-tests.log`

**Recent PITR Tests:**
- Full backup + oplog replay accuracy
- Recovery time measurements
- Data consistency validation
- Cross-region failover time

## 5. Backup Security and Compliance

### 5.1 Encryption

All backups are encrypted at rest using industry-standard encryption:
- **Algorithm:** AES-256-CBC
- **Key Derivation:** PBKDF2 with 100,000 iterations
- **Key Management:** AWS Secrets Manager with automatic rotation
- **Transport:** All S3 uploads use TLS 1.3

### 5.2 Off-Site Storage

Backups are stored off-site with geographic redundancy:
- **Primary Region:** us-east-1 (N. Virginia)
- **Replica Region:** us-west-2 (Oregon)
- **Replication:** Automatic cross-region replication via S3
- **Access Control:** IAM roles with least-privilege access
- **Audit Logging:** CloudTrail logs all backup access

### 5.3 Retention and Compliance

- **Full Backups:** 30-day retention (HIPAA requirement: minimum 6 years for medical records)
- **Oplog Archives:** 7-day retention (enables 7-day PITR window)
- **Archive Policy:** After 30 days, full backups transition to AWS Glacier for long-term retention
- **Compliance:** All backups are encrypted to meet HIPAA and SOC 2 requirements

## 6. Runbooks

Detailed runbooks for common scenarios:
- [MongoDB Primary Down](../monitoring/runbooks/MONGODB_PRIMARY_DOWN.md)
- [API Down](../monitoring/runbooks/API_DOWN.md)
- [Replication Lag](../monitoring/runbooks/MONGODB_REPLICATION_LAG.md)
- [PITR Restore Procedure](../monitoring/runbooks/MONGODB_PITR_RESTORE.md)

## 7. Communication Plan

**RTO Exceeded:**
- Alert PagerDuty → notify on-call engineer
- Update status page: https://status.health-watchers.app
- Email notification to stakeholders

**Data Loss Risk:**
- Escalate to VP Engineering
- Consider breach notification requirements (HIPAA compliance)
- Prepare customer communication
- Document data loss scope and affected records

**Recovery Success:**
- Post-incident review within 24 hours
- Update runbooks based on learnings
- Share lessons with team
- Document actual RTO/RPO achieved vs targets

## 8. Responsibilities

| Role | Responsibility |
|------|-----------------|
| On-Call Engineer | Execute recovery procedures, initiate PITR if needed |
| Platform Lead | Oversee recovery, communicate status, approve data restore |
| DevOps Lead | Manage infrastructure recovery, validate backup integrity |
| DBA | Database recovery and validation, PITR execution |
| Security Lead | Investigate compromise scenarios, validate encryption |

## 9. Change Management

DR plan reviews:
- Quarterly: Full plan review and PITR test
- Post-incident: Updates based on findings
- On-demand: After infrastructure changes
- Monthly: Backup verification and oplog integrity checks

**Recent Updates:**
- 2024-01: Implemented Point-in-Time Recovery (PITR) with continuous oplog archiving
- RPO improved from 24 hours to < 5 minutes
- RTO for database recovery: 20-30 minutes
- Cross-region replication enabled for all backups

Latest review: 2024-01-15
Next review: 2024-04-15

## 10. DR Tooling, Drills and Training

### 10.1 Procedure index

| # | Procedure | Script | Runbook |
|---|-----------|--------|---------|
| 1 | Database backup | `scripts/backup-mongodb.sh` | [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md) |
| 2 | Backup verification (restore + integrity) | `scripts/verify-backup.sh` | [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md) |
| 3 | Geo-redundant replication | `ops/backup/geo-redundant-backup.sh` | §10.2 |
| 4 | Point-in-time / full restore | `scripts/test-disaster-recovery.sh` | [runbooks/DR_DATABASE_RESTORE.md](./runbooks/DR_DATABASE_RESTORE.md) |
| 5 | Region failover | `scripts/dr/failover.sh` | [runbooks/DR_REGION_FAILOVER.md](./runbooks/DR_REGION_FAILOVER.md) |
| 6 | Application recovery | `helm`/`kubectl` | [runbooks/DR_APP_RECOVERY.md](./runbooks/DR_APP_RECOVERY.md) |
| 7 | Secrets recovery | `scripts/secrets/secrets-dr-backup.sh` | [runbooks/DR_SECRETS_RECOVERY.md](./runbooks/DR_SECRETS_RECOVERY.md) |
| 8 | RTO test | `scripts/dr/rto-test.sh` | §10.3 |
| 9 | RPO monitoring | `scripts/dr/rpo-monitor.sh` | §10.4 |
| 10 | Data-integrity verification | `scripts/dr/verify-data-integrity.sh` | §10.5 |
| 11 | Full DR drill | `scripts/dr/dr-drill.sh` | §10.6 |
| 12 | Incident communication | — | [templates/INCIDENT_COMMUNICATION.md](./templates/INCIDENT_COMMUNICATION.md) |

### 10.2 Geo-redundant backup storage

`ops/backup/geo-redundant-backup.sh`:

1. Lists new objects in the primary backup bucket since the last run.
2. Copies each to the DR-region bucket with server-side KMS (region-local key),
   `--copy-props metadata-directive`, and Object Lock retention.
3. Re-hashes the destination object and compares SHA-256 with the source.
4. Emits `dr_backup_replica_lag_seconds` and `dr_backup_replica_verified` metrics.
5. Fails (non-zero) if any object is missing, mismatched, or older than the RPO.

Runs every 15 min as a CronJob and is also a step in the monthly drill.
Native S3 Cross-Region Replication is enabled as the primary mechanism; this
script is the **independent verifier** and backfill for it.

### 10.3 RTO testing — `scripts/dr/rto-test.sh`

Measures the wall-clock time to bring a component back to a serving state and
compares it with the objective.

```bash
scripts/dr/rto-test.sh --component mongodb --target-seconds 1800
scripts/dr/rto-test.sh --component api     --target-seconds 900 --namespace health-watchers-dr
```

- Phases are timed individually (fetch backup, decrypt, restore, index build,
  readiness probe) so regressions are attributable.
- Writes `dr_rto_seconds{component=...}` and `dr_rto_target_seconds{...}` to a
  Prometheus textfile and a JSON report artifact.
- Exit 1 when measured > target. The monthly workflow fails and files an issue.

### 10.4 RPO monitoring — `scripts/dr/rpo-monitor.sh`

Continuously answers "how much data would we lose right now?".

```bash
scripts/dr/rpo-monitor.sh --rpo-seconds 300
```

- Age of the newest continuous oplog object in S3 (primary and replica).
- Age of the newest full archive.
- MongoDB replica-set replication lag (`rs.status()`).
- Emits `dr_rpo_age_seconds` / `dr_rpo_target_seconds`; alert
  `DisasterRecoveryRPOBreached` fires from `monitoring/alerts-disaster-recovery.yml`.

### 10.5 Data-integrity verification — `scripts/dr/verify-data-integrity.sh`

Run after every restore and nightly against production.

- Per-collection document counts vs a rolling baseline (±tolerance).
- Referential checks: no `encounter` without a `patient`, no `invoice` without an
  `encounter`, no orphaned `attachment`.
- Schema-version marker matches the deployed app version.
- Deterministic checksum over an ordered sample of immutable historical records
  (compared source vs restored).
- Index presence matches `db.collection.getIndexes()` expectations.
- Emits `dr_data_integrity_failures` and a JSON report.

### 10.6 DR drills — `scripts/dr/dr-drill.sh`

| Cadence | Scope | Trigger |
|---------|-------|---------|
| Monthly | Automated restore + RTO + integrity in an isolated namespace | `dr-drill` workflow |
| Quarterly | Full: region failover, secrets recovery, DNS cutover, run-book walkthrough | Scheduled, assisted by on-call |
| Ad hoc | After any Sev-1, or major infra change | Manual |

The drill script runs steps 2 → 4 → 5(sim) → 10, aggregates a scorecard
(objective vs actual for every RTO/RPO), and posts it to `#devops` and the
drill log. Quarterly drills additionally: rotate the on-call runner, exercise the
[incident communication templates](./templates/INCIDENT_COMMUNICATION.md) end to
end, and record a post-drill review with action items.

Every drill updates `docs/DR_DRILL_LOG.md` (date, participants, scorecard,
findings, follow-ups).

### 10.7 Staff training

- All engineers complete the DR runbook walkthrough during onboarding and
  re-attest annually (tracked in the HR LMS).
- On-call engineers run at least one supervised drill before taking primary.
- Runbooks are executable and copy-pasteable; every command block is tested in
  the monthly drill so it cannot rot.
- Contact tree and escalation path are in the
  [Communication Plan](#7-communication-plan) and mirrored in
  PagerDuty.

### 10.8 Acceptance criteria mapping

| Criterion | How it is met |
|-----------|---------------|
| Backups verified regularly | `backup-verify` workflow weekly + `verify-data-integrity.sh` nightly |
| Restore tested monthly | `dr-drill` workflow (1st of month) runs `dr-drill.sh` |
| RTO and RPO met | `rto-test.sh` / `rpo-monitor.sh` gate + alert; scorecard in drill log |
| All staff trained | Onboarding module + annual re-attestation + supervised drill for on-call |

## 11. Backup Operations

### 11.1 Backup Schedule and Verification

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

#### Backup Verification (HIPAA Best Practice)

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

### 11.2 Required Secrets

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

### 11.3 Ransomware / Security Breach

**Steps:**
1. **Immediately isolate** affected systems (revoke network access, rotate all secrets).
2. Rotate all secrets: `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, `FIELD_ENCRYPTION_KEY`, database credentials.
3. Invalidate all active JWT tokens (change JWT secrets forces re-login for all users).
4. Restore from a backup predating the breach (coordinate with security team on timeline).
5. Conduct forensic analysis before bringing systems back online.
6. Notify affected patients per HIPAA Breach Notification Rule (within 60 days).
7. File required reports with HHS Office for Civil Rights.

### 11.4 Manual Backup

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

### 11.5 Backup Verification Procedures

Automated weekly verification, manual runs, Prometheus metrics, alert rules, and troubleshooting are documented in [`BACKUP_VERIFICATION.md`](./BACKUP_VERIFICATION.md).

### 11.6 MongoDB Atlas (Recommended for Production)

If using MongoDB Atlas, enable:
- **Continuous Cloud Backup** — point-in-time recovery up to 7 days
- **Cross-region backup replication** — for geographic redundancy
- **Backup compliance policy** — enforces retention and prevents deletion

Atlas PITR restore:
1. Go to Atlas → Clusters → Backup → Restore
2. Select "Point in Time" and choose the target timestamp
3. Restore to a new cluster, verify, then promote to production

### 11.7 Post-Recovery Checklist

- [ ] All API health checks passing
- [ ] Patient records accessible and complete
- [ ] Encounter and lab result data intact
- [ ] Payment records verified
- [ ] Audit logs show no unauthorized access
- [ ] All secrets rotated (if breach suspected)
- [ ] Incident documented in internal incident log
- [ ] HIPAA breach assessment completed (if PHI was exposed)
- [ ] Backup schedule re-enabled and verified
