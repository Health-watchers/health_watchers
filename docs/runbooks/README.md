# Operational Runbooks — Health Watchers

This directory contains operational runbooks for the Health Watchers platform. Each runbook covers a specific operational domain with step-by-step procedures, time estimates, and relevant commands.

---

## Runbooks Index

| # | Runbook | Description | Est. Time |
|---|---|---|---|
| 01 | [Deployment](./01-deployment.md) | Deploy to staging and production via GitHub Actions or kubectl | 10–30 min |
| 02 | [Rollback Procedures](./02-rollback.md) | Roll back a bad deployment or database migration | 5–30 min |
| 03 | [Incident Response](./03-incident-response.md) | Detect, triage, contain, and resolve incidents (incl. HIPAA breaches) | Varies |
| 04 | [Scaling Procedures](./04-scaling.md) | Scale pods horizontally, tune MongoDB connection pools | 5–30 min |
| 05 | [Backup Procedures](./05-backup.md) | Automated and manual MongoDB backups to S3, restore procedures | 10–90 min |
| 06 | [Monitoring Alert Runbooks](./06-monitoring-alerts.md) | Respond to Prometheus, Sentry, and AlertManager alerts | 5–60 min |
| 07 | [Password Reset Procedures](./07-password-reset.md) | User and admin password reset, MFA reset, JWT secret rotation | 5–15 min |
| 08 | [Data Export](./08-data-export.md) | HIPAA right-of-access exports, audit log exports, bulk DB exports | 15–60 min |
| 09 | [User Management](./09-user-management.md) | Create, deactivate, reactivate users; role changes; onboarding/offboarding | 5–30 min |
| 10 | [Database Maintenance](./10-database-maintenance.md) | Migrations, index management, pool tuning, replica set health, retention | 5–120 min |

---

## Quick Reference

### Deploy to production
→ [01-deployment.md — Production Deployment](./01-deployment.md#production-deployment)

### Something broke after a deploy
→ [02-rollback.md — Kubernetes Image Rollback](./02-rollback.md#step-1-kubernetes-image-rollback)

### API is down
→ [03-incident-response.md — Phase 2: Triage](./03-incident-response.md#phase-2--triage-5-15-min)

### Backup failed
→ [05-backup.md — Backup Failure Response](./05-backup.md#backup-failure-response)

### User locked out
→ [07-password-reset.md — Admin-Initiated Password Reset](./07-password-reset.md#admin-initiated-password-reset)

### High latency alert
→ [06-monitoring-alerts.md — High Request Latency](./06-monitoring-alerts.md#alert-high-request-latency)

### Need to export patient data (HIPAA)
→ [08-data-export.md — User-Facing Data Export](./08-data-export.md#user-facing-data-export-hipaa-right-of-access)

### New employee joining
→ [09-user-management.md — Onboarding Checklist](./09-user-management.md#onboarding-checklist-new-staff)

### Employee leaving
→ [09-user-management.md — Offboarding Checklist](./09-user-management.md#offboarding-checklist-staff-departure)

### Database migration
→ [10-database-maintenance.md — Database Migrations](./10-database-maintenance.md#database-migrations)

---

## Stack Reference

| Component | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript |
| API Framework | Express 4 |
| Database | MongoDB 7.0 (mongoose ODM) |
| Cache / Rate Limiting | Redis (ioredis) |
| Container | Docker (multi-stage builds) |
| Orchestration | Kubernetes + Helm |
| CI/CD | GitHub Actions |
| Metrics | Prometheus + Grafana |
| Error Tracking | Sentry |
| Tracing | OpenTelemetry + Jaeger |
| Auth | JWT (access + refresh tokens), TOTP MFA (otplib) |
| Payments | Stellar network |
| Backups | mongodump → AWS S3 (AES-256 encrypted) |
| Compliance | HIPAA (PHI field encryption, audit logs, breach notification) |

---

## Runbook Maintenance

- Review and update runbooks after every significant infrastructure change
- Test procedures in staging before relying on them in a production incident
- Each runbook lists its **Last Updated** date at the top — update it when making changes
- Post-mortems should produce action items that feed back into runbook updates
