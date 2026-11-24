---
title: Disaster Recovery
description: Recovery objectives, backups and DR drills for Health Watchers.
---

# Disaster Recovery

The canonical DR reference is [`docs/DISASTER_RECOVERY.md`](https://github.com/Health-watchers/health_watchers/blob/main/docs/DISASTER_RECOVERY.md). It defines:

- **Recovery objectives**: RTO and RPO per component.
- **Backup strategy**: daily encrypted `mongodump` archives, continuous oplog archiving for point-in-time recovery, and geo-redundant, object-locked copies.
- **Failure scenarios**: database corruption, API failure, data-centre failure, secrets compromise, and ransomware.
- **Drills**: monthly automated restore tests, quarterly PITR drills, RTO/RPO tooling in `scripts/dr/`.
- **Communication plan and responsibilities**.

Related material:

- [Backup verification](https://github.com/Health-watchers/health_watchers/blob/main/docs/BACKUP_VERIFICATION.md)
- [Backup runbook](https://github.com/Health-watchers/health_watchers/blob/main/docs/runbooks/05-backup.md)
- DR runbooks: [database restore](https://github.com/Health-watchers/health_watchers/blob/main/docs/runbooks/DR_DATABASE_RESTORE.md), [region failover](https://github.com/Health-watchers/health_watchers/blob/main/docs/runbooks/DR_REGION_FAILOVER.md), [application recovery](https://github.com/Health-watchers/health_watchers/blob/main/docs/runbooks/DR_APP_RECOVERY.md), [secrets recovery](https://github.com/Health-watchers/health_watchers/blob/main/docs/runbooks/DR_SECRETS_RECOVERY.md)
- [Incident communication templates](https://github.com/Health-watchers/health_watchers/blob/main/docs/templates/INCIDENT_COMMUNICATION.md)
