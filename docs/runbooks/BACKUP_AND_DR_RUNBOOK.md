# Runbook: Backup & Disaster-Recovery Automation

**Use when:** operating, verifying or troubleshooting the automated backup
pipeline, or preparing for a restore.
**Objective:** daily full backup, ≤1h RPO via oplog incrementals, RTO 30 min,
verification passes on every run, DR tested monthly, storage cost monitored.
**Owner:** DevOps on-call.

> Related: [`DR_DATABASE_RESTORE.md`](./DR_DATABASE_RESTORE.md),
> [`../DISASTER_RECOVERY_PROCEDURES.md`](../DISASTER_RECOVERY_PROCEDURES.md),
> [`../BACKUP_VERIFICATION.md`](../BACKUP_VERIFICATION.md).

## 1. What runs when

| Job | Schedule | Script | Result |
|-----|----------|--------|--------|
| Full backup | daily 02:10 UTC | `scripts/backup/backup-scheduler.sh --mode full` | encrypted dump in S3 + checksum verify + GFS retention |
| Oplog incremental | hourly :20 | `scripts/backup/backup-scheduler.sh --mode incremental` | `mongodb/incremental/oplog-*.enc` + advanced checkpoint |
| Restore drill | monthly, 1st 03:00 UTC | `scripts/dr/dr-drill.sh --scope monthly` | RTO/RPO/integrity scorecard, appended to `docs/DR_DRILL_LOG.md` |
| Cost report | weekly Mon 06:00 UTC | `scripts/backup/backup-cost-report.sh` | per-storage-class cost + tiering hints + Pushgateway metric |

Deployed by `k8s/backup/backup-cronjobs.yaml`. `backup-scheduler.sh --mode auto`
(the default) picks full vs incremental from `FULL_BACKUP_HOUR`.

## 2. Backup layout in S3

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

## 3. Health checks

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

## 4. Common failures

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `FullBackupRunMissing` | CronJob not scheduled / node pressure / bad creds | `kubectl -n health-watchers get cronjob mongodb-full-backup`; check last Job's logs; run `backup-scheduler.sh --mode full` manually |
| `BackupChecksumVerificationFailed` | truncated upload, wrong `BACKUP_ENCRYPTION_KEY`, corrupt dump | re-run the full backup; if it re-fails, restore from the previous good backup and open a Sev-2 |
| `IncrementalBackupStalled` | oplog rolled over past the checkpoint, `mongodump` on `local.oplog.rs` denied | verify the backup user has `read` on `local`; if the checkpoint is older than the oplog window, take a fresh full backup (resets the chain) |
| `BackupRetentionNotEnforced` | retention step erroring inside the full job | run `scripts/backup/enforce-retention.sh --dry-run` and inspect |
| `BackupStorageCostSpike` | retention failure or cold objects on STANDARD | `scripts/backup/backup-cost-report.sh`; apply the tiering hint |

## 5. Restore

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

## 6. Manual DR test (out of cycle)

```bash
kubectl -n health-watchers create job --from=cronjob/mongodb-restore-drill dr-drill-adhoc
kubectl -n health-watchers logs -f job/dr-drill-adhoc
```

The drill restores into a throwaway target, measures RTO, runs
`scripts/dr/verify-data-integrity.sh`, and appends a row to
`docs/DR_DRILL_LOG.md`. A failed drill pages `health-watchers-oncall`.

## 7. Configuration reference

| Env / ConfigMap key | Default | Meaning |
|---------------------|---------|---------|
| `FULL_BACKUP_HOUR` | `02` | UTC hour `--mode auto` runs the full backup |
| `DAILY_KEEP` / `WEEKLY_KEEP` / `MONTHLY_KEEP` | `7` / `4` / `12` | GFS retention counts |
| `GLACIER_AFTER_DAYS` | `30` | retained objects older than this are tiered to `GLACIER_IR` |
| `DR_BACKUP_BUCKET` | – | cross-region copy target (see `ops/backup/geo-redundant-backup.sh`) |
| `PUSHGATEWAY_URL` | – | where every job pushes its run metrics |
| `BACKUP_ENCRYPTION_KEY` | – | AES-256 passphrase; **rotating it breaks restores of older backups** |
