#!/bin/bash
# scripts/dr/rpo-monitor.sh
# Monitor the Recovery Point Objective: how much data would be lost on failover
# right now. Checks backup freshness (primary + replica) and replica-set lag,
# emits Prometheus metrics, and exits non-zero on an RPO breach.
#
# Usage:
#   rpo-monitor.sh --rpo-seconds 300 [--continuous --interval 60]
#
# Env: BACKUP_BUCKET, DR_BACKUP_BUCKET, AWS_REGION, DR_REGION, MONGO_URI

set -euo pipefail

RPO=300
CONTINUOUS=false
INTERVAL=60
BACKUP_BUCKET="${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
DR_BACKUP_BUCKET="${DR_BACKUP_BUCKET:-$BACKUP_BUCKET}"
AWS_REGION="${AWS_REGION:-us-east-1}"
DR_REGION="${DR_REGION:-eu-west-1}"
OPLOG_PREFIX="${OPLOG_PREFIX:-mongodb/oplog}"
FULL_PREFIX="${FULL_PREFIX:-mongodb/full}"
METRICS_FILE="${METRICS_FILE:-/tmp/dr_rpo_metrics.txt}"

log()   { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
error() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ❌ $*" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rpo-seconds) RPO="$2"; shift 2 ;;
    --continuous)  CONTINUOUS=true; shift ;;
    --interval)    INTERVAL="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) error "unknown arg: $1"; exit 1 ;;
  esac
done

newest_object_age() {
  local bucket="$1" prefix="$2" region="$3" latest ts epoch
  latest="$(aws s3api list-objects-v2 --bucket "$bucket" --prefix "$prefix" \
    --region "$region" --query 'sort_by(Contents,&LastModified)[-1].LastModified' \
    --output text 2>/dev/null || echo None)"
  [[ "$latest" != "None" && -n "$latest" ]] || { echo -1; return; }
  epoch="$(date -d "$latest" +%s 2>/dev/null || echo 0)"
  echo $(( $(date +%s) - epoch ))
}

replica_lag_seconds() {
  [[ -n "${MONGO_URI:-}" ]] || { echo -1; return; }
  mongosh "$MONGO_URI" --quiet --eval '
    const s = rs.status();
    const p = s.members.find(m => m.stateStr === "PRIMARY");
    const secs = s.members.filter(m => m.stateStr === "SECONDARY");
    if (!p || secs.length === 0) { print(-1); quit(); }
    const lag = Math.max(...secs.map(m => (p.optimeDate - m.optimeDate) / 1000));
    print(Math.round(lag));
  ' 2>/dev/null || echo -1
}

check_once() {
  local breach=0
  local oplog_primary oplog_replica full_primary lag

  oplog_primary=$(newest_object_age "$BACKUP_BUCKET" "$OPLOG_PREFIX" "$AWS_REGION")
  oplog_replica=$(newest_object_age "$DR_BACKUP_BUCKET" "$OPLOG_PREFIX" "$DR_REGION")
  full_primary=$(newest_object_age "$BACKUP_BUCKET" "$FULL_PREFIX" "$AWS_REGION")
  lag=$(replica_lag_seconds)

  log "oplog primary age : ${oplog_primary}s (rpo ${RPO}s)"
  log "oplog replica age : ${oplog_replica}s"
  log "full backup age   : ${full_primary}s"
  log "replica-set lag   : ${lag}s"

  (( oplog_primary < 0 || oplog_primary > RPO )) && { error "primary oplog RPO breach"; breach=1; }
  (( oplog_replica < 0 || oplog_replica > RPO * 3 )) && { error "replica oplog stale (>3x RPO)"; breach=1; }
  (( full_primary < 0 || full_primary > 90000 )) && { error "no full backup in ~25h"; breach=1; }
  (( lag >= 0 && lag > RPO )) && { error "replica-set lag exceeds RPO"; breach=1; }

  {
    echo "# HELP dr_rpo_age_seconds Age of newest recovery point"
    echo "# TYPE dr_rpo_age_seconds gauge"
    echo "dr_rpo_age_seconds{source=\"oplog\",region=\"primary\"} $oplog_primary"
    echo "dr_rpo_age_seconds{source=\"oplog\",region=\"replica\"} $oplog_replica"
    echo "dr_rpo_age_seconds{source=\"full\",region=\"primary\"} $full_primary"
    echo "dr_replica_set_lag_seconds $lag"
    echo "# HELP dr_rpo_target_seconds Configured RPO target"
    echo "# TYPE dr_rpo_target_seconds gauge"
    echo "dr_rpo_target_seconds $RPO"
    echo "dr_rpo_check_timestamp_seconds $(date +%s)"
  } > "$METRICS_FILE"

  return $breach
}

if $CONTINUOUS; then
  log "continuous RPO monitor: rpo=${RPO}s interval=${INTERVAL}s"
  while true; do check_once || true; sleep "$INTERVAL"; done
else
  check_once
fi
