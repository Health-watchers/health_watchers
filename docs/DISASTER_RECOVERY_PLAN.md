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

| Component | RPO | Backup Frequency |
|-----------|-----|------------------|
| MongoDB (Production) | 5 minutes | Every 5 minutes (incremental) |
| MongoDB (Staging) | 1 hour | Daily full backup |
| Application Code | N/A | On every commit (Git) |
| Configuration | 30 minutes | On every deploy |
| Secrets | Real-time | Centralized secret manager |

## 2. Backup Strategy

### 2.1 Database Backups

**MongoDB Production**
- Type: Continuous incremental backups with daily full backups
- Retention: 7 full backups (7 days), continuous incremental
- Storage: AWS S3 (cross-region replication)
- Frequency: Daily full + hourly incremental

**Backup Command:**
```bash
mongodump --uri="mongodb://connection-string" --archive="health-watchers-$(date +%Y%m%d-%H%M%S).archive"
```

**Restore Command:**
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

### 3.1 Database Corruption (RTO: 30 minutes)

**Detection:**
- MongoDB replication lag exceeds 10 seconds
- Backup integrity checks fail
- Data consistency errors in logs

**Recovery Steps:**
1. Stop all write operations: `kubectl scale deployment api --replicas=0`
2. List available backups: `aws s3 ls s3://backups/mongodb/`
3. Restore from latest clean backup: `mongorestore --archive=latest.archive --drop`
4. Run database integrity checks
5. Resume API: `kubectl scale deployment api --replicas=3`
6. Validate application health checks pass

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

- **Week 1:** Database restoration test
- **Week 2:** API failover test
- **Week 3:** Configuration rollback test
- **Week 4:** Full application restore test

### 4.2 Annual Comprehensive Test

Complete test of all systems simulating total failure:
- Restore database from archive
- Deploy all services from scratch
- Run full test suite
- Validate data integrity
- Test failover procedures

### 4.3 Test Results

Results are tracked in `/docs/disaster-recovery-tests.log`

## 5. Runbooks

Detailed runbooks for common scenarios:
- [MongoDB Primary Down](../monitoring/runbooks/MONGODB_PRIMARY_DOWN.md)
- [API Down](../monitoring/runbooks/API_DOWN.md)
- [Replication Lag](../monitoring/runbooks/MONGODB_REPLICATION_LAG.md)

## 6. Communication Plan

**RTO Exceeded:**
- Alert PagerDuty → notify on-call engineer
- Update status page: https://status.health-watchers.app
- Email notification to stakeholders

**Data Loss Risk:**
- Escalate to VP Engineering
- Consider breach notification requirements
- Prepare customer communication

**Recovery Success:**
- Post-incident review within 24 hours
- Update runbooks based on learnings
- Share lessons with team

## 7. Responsibilities

| Role | Responsibility |
|------|-----------------|
| On-Call Engineer | Execute recovery procedures |
| Platform Lead | Oversee recovery, communicate status |
| DevOps Lead | Manage infrastructure recovery |
| DBA | Database recovery and validation |
| Security Lead | Investigate compromise scenarios |

## 8. Change Management

DR plan reviews:
- Quarterly: Full plan review
- Post-incident: Updates based on findings
- On-demand: After infrastructure changes

Latest review: [DATE]
Next review: [DATE + 3 MONTHS]
