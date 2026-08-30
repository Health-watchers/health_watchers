# Runbook: MongoDB Restore

**Use when:** data loss / corruption, a bad migration, or a full region rebuild.
**Objective:** RTO 30 min, RPO 5 min.
**Owner:** DevOps on-call.

> Related: [`DISASTER_RECOVERY_PROCEDURES.md`](../DISASTER_RECOVERY_PROCEDURES.md),
> [`BACKUP_VERIFICATION.md`](../BACKUP_VERIFICATION.md),
> [`disaster-recovery.md`](../disaster-recovery.md).

## 0. Declare and communicate

1. Page `health-watchers-oncall`, open a Sev-1 incident.
2. Post the "Investigating" status update — see
   [`../templates/INCIDENT_COMMUNICATION.md`](../templates/INCIDENT_COMMUNICATION.md).
3. Put the API into maintenance mode if writes could worsen corruption:
   `kubectl -n health-watchers scale deploy/health-watchers-api --replicas=0`.

## 1. Choose a recovery point

| Situation | Recovery point |
|-----------|----------------|
| Accidental delete / bad deploy at known time T | PITR to T-1min via oplog replay |
| Corruption discovered late | latest daily full that passes integrity |
| Region loss | latest full + oplog in the DR region bucket |

List candidates:

```bash
aws s3 ls s3://$BACKUP_BUCKET/mongodb/full/  --region $AWS_REGION | tail -10
aws s3 ls s3://$BACKUP_BUCKET/mongodb/oplog/ --region $AWS_REGION | tail -20
```

## 2. Restore

**Automated path (preferred):**

```bash
MONGO_URI="mongodb://<target-primary>/health_watchers" \
BACKUP_BUCKET=$BACKUP_BUCKET BACKUP_ENCRYPTION_KEY=$BACKUP_ENCRYPTION_KEY \
scripts/dr/rto-test.sh --component mongodb --target-seconds 1800
```

`rto-test.sh` performs the real restore (fetch → decrypt → `mongorestore --drop`
→ readiness) and times it. For a production restore point it at the production
target URI; it is the same code path the monthly drill exercises.

**Manual path:**

```bash
aws s3 cp s3://$BACKUP_BUCKET/mongodb/full/<archive>.enc /restore/backup.enc --region $AWS_REGION
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in /restore/backup.enc -out /restore/backup.archive -pass "pass:$BACKUP_ENCRYPTION_KEY"
mongorestore --uri="$MONGO_URI" --drop --gzip --archive=/restore/backup.archive --numParallelCollections=4
```

**Point-in-time (oplog replay) after the full restore:**

```bash
# download oplog segments between the full-backup time and target T
mongorestore --uri="$MONGO_URI" --oplogReplay --oplogLimit "<T-epoch>:1" /restore/oplog/
```

## 3. Verify

```bash
scripts/dr/verify-data-integrity.sh --uri "$MONGO_URI"
```

Must exit 0. Investigate any orphan / count / checksum failure before proceeding.

## 4. Reconnect and ramp

```bash
kubectl -n health-watchers rollout restart deploy/health-watchers-api
kubectl -n health-watchers scale deploy/health-watchers-api --replicas=4
kubectl -n health-watchers rollout status deploy/health-watchers-api --timeout=600s
curl -fsS https://app.health-watchers.io/api/health
```

## 5. Close out

- Post "Resolved" status update; note data-loss window (RPO actually achieved).
- Record measured RTO/RPO in `docs/DR_DRILL_LOG.md`.
- Schedule post-mortem within 48 h; file follow-up issues (label `devops`).
- If the backup key was exposed during recovery, rotate `backup-encryption-key`
  (see [`../SECRETS_MANAGEMENT.md`](../SECRETS_MANAGEMENT.md)).

## Rollback

If the restored data is worse than the current state, redeploy pointing at the
untouched secondary and re-evaluate the recovery point. Never `--drop` the only
surviving copy — snapshot the volume first.
