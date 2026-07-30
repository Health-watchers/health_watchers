# Disaster Recovery Playbook

Health Watchers — HIPAA-Compliant EMR

| Attribute | Value |
|-----------|-------|
| RTO | < 4 hours |
| RPO | < 6 hours (incremental backup interval) |
| Last reviewed | 2026-07-29 |
| Owner | DevOps / Engineering Lead |

## Recovery Objectives

### RTO / RPO

| Component | RTO | RPO |
|-----------|-----|-----|
| MongoDB (Production) | 30 min | 5 min |
| MongoDB (Staging) | 2 hours | 1 hour |
| API Server | 15 min | N/A |
| Web Application | 30 min | N/A |
| Redis Cache | 5 min | N/A |
| Stellar Service | 60 min | N/A |

## Backup Strategy

| Type | Schedule | Retention |
|------|----------|-----------|
| Full backup | Daily 02:00 UTC | 30 days |
| Incremental backup | Every 6 hours | 7 days |
| Verification | Sundays 03:00 UTC | Weekly |

Backups are encrypted with AES-256-CBC and stored in S3 `STANDARD_IA`.

## Recovery Procedures

### 1. Accidental Data Deletion

1. Immediately stop write traffic: `kubectl scale deployment/api --replicas=0`
2. List backups: `aws s3 ls s3://$BACKUP_BUCKET/mongodb/ --region $AWS_REGION | sort`
3. Download and decrypt target backup
4. Restore to staging first: `mongorestore --uri="$STAGING_MONGO_URI" /tmp/restore/ --drop`
5. Validate critical collections (patients, encounters, payments)
6. Restore to production: `mongorestore --uri="$MONGO_URI" /tmp/restore/ --drop`
7. Resume API: `kubectl scale deployment/api --replicas=3`
8. Document the incident

### 2. Database Server Failure

1. Provision a new MongoDB instance
2. Restore from latest S3 backup
3. Update `MONGO_URI` in secrets
4. Restart API instances
5. Verify `/health` endpoint

### 3. Full Application Outage

1. Restore database first
2. Redeploy from last known-good image:
   ```bash
   docker-compose -f docker-compose.prod.yml pull
   docker-compose -f docker-compose.prod.yml up -d
   ```
3. Verify API, Web, and Stellar service health endpoints
4. Run smoke tests

### 4. Secrets Compromise

1. Rotate all secrets in AWS Secrets Manager
2. Redeploy all pods: `kubectl rollout restart deployment/api`
3. Update external integrations
4. Audit access logs and revoke compromised tokens

## Verification

Automated verification runs weekly via `.github/workflows/backup-verify.yml`.

Manual verification:
```bash
bash scripts/verify-backup.sh
```

## Communication Plan

- **RTO Exceeded**: Alert on-call engineer, update status page, email stakeholders
- **Data Loss Risk**: Escalate to VP Engineering, notify affected patients per HIPAA
- **Recovery Success**: Post-incident review within 24 hours

## Responsibilities

| Role | Responsibility |
|------|----------------|
| On-Call Engineer | Execute recovery procedures |
| Platform Lead | Oversee recovery, communicate status |
| DevOps Lead | Manage infrastructure recovery |
| DBA | Database recovery and validation |
| Security Lead | Investigate compromise scenarios |

## Change Management

- Quarterly: Full plan review
- Post-incident: Updates based on findings
- On-demand: After infrastructure changes
