# Disaster Recovery Plan - Health Watchers

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

