#!/bin/bash
# scripts/backup/backup-scheduler.sh
# Single entry point invoked by cron / the K8s CronJob (#1262).
#
# Decides which backup to run based on the schedule and the clock, chains the
# verification + retention steps, and always emits a run summary to the
# Prometheus Pushgateway so "backups complete daily" and "verification passes
# 100%" can be alerted on.
#
#   mode=auto  (default)  full backup at/after FULL_BACKUP_HOUR, otherwise incremental
#   mode=full             force a full backup + checksum verification
#   mode=incremental      force an oplog incremental
#
# Usage:  ./scripts/backup/backup-scheduler.sh [--mode auto|full|incremental]
# Env:    MONGO_URI, BACKUP_ENCRYPTION_KEY, BACKUP_BUCKET, AWS_REGION,
#         FULL_BACKUP_HOUR (default 02), PUSHGATEWAY_URL

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="auto"
FULL_BACKUP_HOUR="${FULL_BACKUP_HOUR:-02}"
START_TS=$(date -u +%s)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [scheduler] $*"; }

push_summary() {
  # push_summary <kind> <status:0|1> <duration_s>
  [[ -z "${PUSHGATEWAY_URL:-}" ]] && return 0
  cat <<EOF | curl -sf --data-binary @- "$PUSHGATEWAY_URL/metrics/job/mongodb_backup_scheduler/kind/$1" || true
# TYPE backup_run_status gauge
backup_run_status{kind="$1"} $2
# TYPE backup_run_duration_seconds gauge
backup_run_duration_seconds{kind="$1"} $3
# TYPE backup_run_last_timestamp gauge
backup_run_last_timestamp{kind="$1"} $(date -u +%s)
EOF
}

if [[ "$MODE" == "auto" ]]; then
  CURRENT_HOUR=$(date -u +%H)
  if [[ "$CURRENT_HOUR" == "$FULL_BACKUP_HOUR" ]]; then MODE="full"; else MODE="incremental"; fi
fi
log "Resolved mode: $MODE"

STATUS=1
trap 'push_summary "$MODE" "$STATUS" "$(( $(date -u +%s) - START_TS ))"' EXIT

if [[ "$MODE" == "full" ]]; then
  log "Running full backup (dump + encrypt + upload + retention) ..."
  bash "$ROOT/scripts/backup-mongodb.sh"
  log "Verifying the freshly written backup ..."
  bash "$ROOT/scripts/backup/verify-backup-checksum.sh"
  log "Enforcing grandfather-father-son retention ..."
  bash "$ROOT/scripts/backup/enforce-retention.sh"
else
  log "Running oplog incremental ..."
  bash "$ROOT/scripts/backup/incremental-backup.sh"
fi

STATUS=0
log "Backup run ($MODE) finished OK in $(( $(date -u +%s) - START_TS ))s"
