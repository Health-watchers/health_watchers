# Disaster Recovery Procedures

Operational companion to the strategy documents
[`DISASTER_RECOVERY_PLAN.md`](./DISASTER_RECOVERY_PLAN.md) and
[`disaster-recovery.md`](./disaster-recovery.md). This file defines the
**repeatable procedures, automation, and drills** that keep those plans honest.

| Attribute | Value |
|-----------|-------|
| Platform RTO | 30 min (critical path: API + MongoDB) |
| Platform RPO | 5 min (continuous oplog) / 6 h (incremental archive floor) |
| Backup storage | S3 `us-east-1` primary + `eu-west-1` geo-redundant replica, object-lock |
| Restore test cadence | Monthly (automated) + quarterly full drill (assisted) |
| Owner | DevOps / Platform Engineering |
| Escalation | PagerDuty `health-watchers-oncall` → Engineering Lead → CTO |

## 1. Procedure index

| # | Procedure | Script | Runbook |
|---|-----------|--------|---------|
| 1 | Database backup | `scripts/backup-mongodb.sh` | [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md) |
| 2 | Backup verification (restore + integrity) | `scripts/verify-backup.sh` | [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md) |
| 3 | Geo-redundant replication | `ops/backup/geo-redundant-backup.sh` | this doc §4 |
| 4 | Point-in-time / full restore | `scripts/test-disaster-recovery.sh` | [runbooks/DR_DATABASE_RESTORE.md](./runbooks/DR_DATABASE_RESTORE.md) |
| 5 | Region failover | `scripts/dr/failover.sh` | [runbooks/DR_REGION_FAILOVER.md](./runbooks/DR_REGION_FAILOVER.md) |
| 6 | Application recovery | `helm`/`kubectl` | [runbooks/DR_APP_RECOVERY.md](./runbooks/DR_APP_RECOVERY.md) |
| 7 | Secrets recovery | `scripts/secrets/secrets-dr-backup.sh` | [runbooks/DR_SECRETS_RECOVERY.md](./runbooks/DR_SECRETS_RECOVERY.md) |
| 8 | RTO test | `scripts/dr/rto-test.sh` | this doc §5 |
| 9 | RPO monitoring | `scripts/dr/rpo-monitor.sh` | this doc §6 |
| 10 | Data-integrity verification | `scripts/dr/verify-data-integrity.sh` | this doc §7 |
| 11 | Full DR drill | `scripts/dr/dr-drill.sh` | this doc §8 |
| 12 | Incident communication | — | [templates/INCIDENT_COMMUNICATION.md](./templates/INCIDENT_COMMUNICATION.md) |

## 2. Recovery objectives by component

| Component | RTO | RPO | Recovery method |
|-----------|-----|-----|-----------------|
| API server | 15 min | n/a (stateless) | Redeploy from image / failover region |
| Web app | 30 min | n/a | Redeploy / CDN serves cached shell |
| MongoDB (replica set) | 30 min | 5 min | Secondary promotion → PITR restore |
| Redis | 5 min | best-effort | Rebuild from source of truth |
| Stellar service | 60 min | 5 min | Redeploy + resync horizon cursor |
| Secrets | 30 min | 1 h | Restore from replica / Vault snapshot |
| Object storage (uploads) | 60 min | 15 min | Cross-region bucket replication |

## 3. Backup strategy (summary)

- **Continuous**: MongoDB oplog tailing → S3 (`STANDARD`), 5-minute objects.
- **Full**: daily `mongodump` at 02:00 UTC, `tar+gzip`, AES-256-CBC
  (PBKDF2, 100k iter), S3 `STANDARD_IA`, 30-day retention, 7 full kept hot.
- **Encryption**: archive key is `backup-encryption-key` in the secret store
  (see [SECRETS_MANAGEMENT.md](./SECRETS_MANAGEMENT.md)).
- **Verification**: `verify-backup.sh` runs weekly (Sun 03:00 UTC) via the
  `backup-verify` workflow — downloads the latest archive, restores to a throw-away
  MongoDB, runs integrity checks, emits Prometheus metrics, and pages on failure.
- **Immutability**: geo-redundant copies are written with S3 Object Lock
  (GOVERNANCE, 35 days) so ransomware / accidental deletion cannot destroy them.

## 4. Geo-redundant backup storage

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

## 5. RTO testing — `scripts/dr/rto-test.sh`

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

## 6. RPO monitoring — `scripts/dr/rpo-monitor.sh`

Continuously answers "how much data would we lose right now?".

```bash
scripts/dr/rpo-monitor.sh --rpo-seconds 300
```

- Age of the newest continuous oplog object in S3 (primary and replica).
- Age of the newest full archive.
- MongoDB replica-set replication lag (`rs.status()`).
- Emits `dr_rpo_age_seconds` / `dr_rpo_target_seconds`; alert
  `DisasterRecoveryRPOBreached` fires from `monitoring/alerts-disaster-recovery.yml`.

## 7. Data-integrity verification — `scripts/dr/verify-data-integrity.sh`

Run after every restore and nightly against production.

- Per-collection document counts vs a rolling baseline (±tolerance).
- Referential checks: no `encounter` without a `patient`, no `invoice` without an
  `encounter`, no orphaned `attachment`.
- Schema-version marker matches the deployed app version.
- Deterministic checksum over an ordered sample of immutable historical records
  (compared source vs restored).
- Index presence matches `db.collection.getIndexes()` expectations.
- Emits `dr_data_integrity_failures` and a JSON report.

## 8. DR drills — `scripts/dr/dr-drill.sh`

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

## 9. Staff training

- All engineers complete the DR runbook walkthrough during onboarding and
  re-attest annually (tracked in the HR LMS).
- On-call engineers run at least one supervised drill before taking primary.
- Runbooks are executable and copy-pasteable; every command block is tested in
  the monthly drill so it cannot rot.
- Contact tree and escalation path are in §1 of
  [`DISASTER_RECOVERY_PLAN.md`](./DISASTER_RECOVERY_PLAN.md) and mirrored in
  PagerDuty.

## 10. Acceptance criteria mapping

| Criterion | How it is met |
|-----------|---------------|
| Backups verified regularly | `backup-verify` workflow weekly + `verify-data-integrity.sh` nightly |
| Restore tested monthly | `dr-drill` workflow (1st of month) runs `dr-drill.sh` |
| RTO and RPO met | `rto-test.sh` / `rpo-monitor.sh` gate + alert; scorecard in drill log |
| All staff trained | Onboarding module + annual re-attestation + supervised drill for on-call |
