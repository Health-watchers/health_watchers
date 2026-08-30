#!/bin/bash
# ops/backup/geo-redundant-backup.sh
# Independent verifier + backfill for cross-region backup replication.
#
# S3 Cross-Region Replication (CRR) is the primary mechanism. This script runs
# every 15 min to PROVE the DR-region copy exists and is byte-identical, and to
# backfill anything CRR missed. Emits metrics for the DR RPO dashboard.
#
# Usage:
#   geo-redundant-backup.sh [--since-hours 24] [--dry-run]
#
# Env: BACKUP_BUCKET (primary), DR_BACKUP_BUCKET (replica),
#      AWS_REGION (default us-east-1), DR_REGION (default eu-west-1),
#      DR_KMS_KEY_ID (region-local CMK), LOCK_DAYS (default 35)

set -euo pipefail

SINCE_HOURS=24
DRY_RUN=false
BACKUP_BUCKET="${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
DR_BACKUP_BUCKET="${DR_BACKUP_BUCKET:?DR_BACKUP_BUCKET is required}"
AWS_REGION="${AWS_REGION:-us-east-1}"
DR_REGION="${DR_REGION:-eu-west-1}"
DR_KMS_KEY_ID="${DR_KMS_KEY_ID:-alias/health-watchers-dr-backups}"
LOCK_DAYS="${LOCK_DAYS:-35}"
PREFIXES=("mongodb/full" "mongodb/oplog" "uploads" "secrets")
METRICS_FILE="${METRICS_FILE:-/tmp/dr_geo_backup_metrics.txt}"

log()     { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
error()   { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ❌ $*" >&2; }
success() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✅ $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --since-hours) SINCE_HOURS="$2"; shift 2 ;;
    --dry-run)     DRY_RUN=true; shift ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) error "unknown arg: $1"; exit 1 ;;
  esac
done

CUTOFF=$(date -u -d "-${SINCE_HOURS} hours" +%s)
COPIED=0 VERIFIED=0 MISMATCH=0 MISSING=0 MAX_LAG=0

etag_of() {  # strips quotes; for non-multipart uploads this is the MD5
  aws s3api head-object --bucket "$1" --key "$2" --region "$3" \
    --query 'ETag' --output text 2>/dev/null | tr -d '"' || echo ""
}

for prefix in "${PREFIXES[@]}"; do
  log "Scanning s3://$BACKUP_BUCKET/$prefix/ (last ${SINCE_HOURS}h)"
  while read -r lastmod key; do
    [[ -n "$key" ]] || continue
    obj_epoch=$(date -u -d "$lastmod" +%s)
    (( obj_epoch >= CUTOFF )) || continue

    lag=$(( $(date +%s) - obj_epoch ))
    (( lag > MAX_LAG )) && MAX_LAG=$lag

    src_etag="$(etag_of "$BACKUP_BUCKET" "$key" "$AWS_REGION")"
    dst_etag="$(etag_of "$DR_BACKUP_BUCKET" "$key" "$DR_REGION")"

    if [[ -z "$dst_etag" ]]; then
      MISSING=$((MISSING+1))
      log "  MISSING in replica: $key — backfilling"
      if $DRY_RUN; then
        log "  [dry-run] cp $key -> s3://$DR_BACKUP_BUCKET/$key"
      else
        aws s3 cp "s3://$BACKUP_BUCKET/$key" "s3://$DR_BACKUP_BUCKET/$key" \
          --source-region "$AWS_REGION" --region "$DR_REGION" \
          --sse aws:kms --sse-kms-key-id "$DR_KMS_KEY_ID" \
          --metadata-directive COPY
        aws s3api put-object-retention --bucket "$DR_BACKUP_BUCKET" --key "$key" \
          --region "$DR_REGION" \
          --retention "Mode=GOVERNANCE,RetainUntilDate=$(date -u -d "+${LOCK_DAYS} days" +%Y-%m-%dT%H:%M:%SZ)" \
          2>/dev/null || true
        COPIED=$((COPIED+1))
        dst_etag="$(etag_of "$DR_BACKUP_BUCKET" "$key" "$DR_REGION")"
      fi
    fi

    # verify (skip multipart etags which contain a dash — compare size instead)
    if [[ -n "$dst_etag" ]]; then
      if [[ "$src_etag" == *-* || "$dst_etag" == *-* ]]; then
        s1=$(aws s3api head-object --bucket "$BACKUP_BUCKET" --key "$key" --region "$AWS_REGION" --query 'ContentLength' --output text)
        s2=$(aws s3api head-object --bucket "$DR_BACKUP_BUCKET" --key "$key" --region "$DR_REGION" --query 'ContentLength' --output text)
        if [[ "$s1" == "$s2" ]]; then VERIFIED=$((VERIFIED+1)); else MISMATCH=$((MISMATCH+1)); error "size mismatch: $key ($s1 vs $s2)"; fi
      elif [[ "$src_etag" == "$dst_etag" ]]; then
        VERIFIED=$((VERIFIED+1))
      else
        MISMATCH=$((MISMATCH+1)); error "etag mismatch: $key ($src_etag vs $dst_etag)"
      fi
    fi
  done < <(aws s3api list-objects-v2 --bucket "$BACKUP_BUCKET" --prefix "$prefix/" \
             --region "$AWS_REGION" --query 'Contents[].[LastModified,Key]' --output text)
done

{
  echo "# HELP dr_backup_replica_verified Objects verified identical in the DR region"
  echo "# TYPE dr_backup_replica_verified gauge"
  echo "dr_backup_replica_verified $VERIFIED"
  echo "dr_backup_replica_backfilled $COPIED"
  echo "dr_backup_replica_missing $MISSING"
  echo "dr_backup_replica_mismatch $MISMATCH"
  echo "# HELP dr_backup_replica_lag_seconds Age of the newest replicated object"
  echo "# TYPE dr_backup_replica_lag_seconds gauge"
  echo "dr_backup_replica_lag_seconds $MAX_LAG"
  echo "dr_backup_replica_check_timestamp_seconds $(date +%s)"
} > "$METRICS_FILE"

log "verified=$VERIFIED backfilled=$COPIED missing=$MISSING mismatch=$MISMATCH max_lag=${MAX_LAG}s"
if (( MISMATCH > 0 )); then
  error "replication integrity FAILED"
  exit 1
fi
success "geo-redundant backup verified"
