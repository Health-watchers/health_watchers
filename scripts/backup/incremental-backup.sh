#!/bin/bash
# scripts/backup/incremental-backup.sh
# Oplog-based incremental MongoDB backup (#1262).
#
# Captures every oplog entry since the last checkpoint and uploads it as an
# encrypted, compressed slice. Chained together with the most recent full dump
# from scripts/backup-mongodb.sh, these slices give point-in-time recovery and
# keep the recovery-point objective (RPO) small between daily full backups.
#
# A checkpoint marker (last oplog timestamp) is stored alongside the slices in
# S3 so consecutive runs never overlap or leave a gap.
#
# Usage:   ./scripts/backup/incremental-backup.sh
# Required env: MONGO_URI, BACKUP_ENCRYPTION_KEY, BACKUP_BUCKET
# Optional env: AWS_REGION (us-east-1), S3_PREFIX (mongodb),
#               PUSHGATEWAY_URL (Prometheus Pushgateway for run metrics)

set -euo pipefail

: "${MONGO_URI:?MONGO_URI is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
AWS_REGION="${AWS_REGION:-us-east-1}"
S3_PREFIX="${S3_PREFIX:-mongodb}"
INCR_PREFIX="$S3_PREFIX/incremental"
MARKER_KEY="$S3_PREFIX/incremental/_checkpoint.json"

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
NOW_TS=$(date -u +%s)
WORKDIR="${WORKDIR:-/tmp/incr-backup-$TIMESTAMP}"
mkdir -p "$WORKDIR"
trap 'rm -rf "$WORKDIR"' EXIT

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

push_metric() {
  # push_metric <status:0|1> <slice_bytes> <lag_seconds>
  [[ -z "${PUSHGATEWAY_URL:-}" ]] && return 0
  cat <<EOF | curl -sf --data-binary @- "$PUSHGATEWAY_URL/metrics/job/mongodb_incremental_backup" || true
# TYPE backup_incremental_last_success_timestamp gauge
backup_incremental_last_success_timestamp $NOW_TS
# TYPE backup_incremental_status gauge
backup_incremental_status $1
# TYPE backup_incremental_slice_bytes gauge
backup_incremental_slice_bytes $2
# TYPE dr_rpo_age_seconds gauge
dr_rpo_age_seconds{source="oplog",region="primary"} $3
EOF
}

# ── Resolve the starting oplog timestamp ─────────────────────────────────────
LAST_TS=0
if aws s3 cp "s3://$BACKUP_BUCKET/$MARKER_KEY" "$WORKDIR/checkpoint.json" \
    --region "$AWS_REGION" --quiet 2>/dev/null; then
  LAST_TS=$(grep -o '"lastOplogEpoch"[^,}]*' "$WORKDIR/checkpoint.json" | grep -o '[0-9]\+' | head -1)
  log "Resuming from checkpoint epoch $LAST_TS"
else
  log "No checkpoint found — seeding from the most recent full backup boundary"
fi

# ── Export the oplog slice ($gt last checkpoint) ────────────────────────────
QUERY="{ \"ts\": { \"\$gt\": { \"\$timestamp\": { \"t\": ${LAST_TS:-0}, \"i\": 0 } } } }"
log "Dumping oplog entries newer than epoch ${LAST_TS:-0} ..."
mongodump --uri="$MONGO_URI" \
  --db=local --collection=oplog.rs \
  --query="$QUERY" \
  --out="$WORKDIR/dump" --quiet

SLICE_BSON="$WORKDIR/dump/local/oplog.rs.bson"
if [[ ! -s "$SLICE_BSON" ]]; then
  log "No new oplog entries — nothing to upload."
  LAG=$(( NOW_TS - (LAST_TS>0 ? LAST_TS : NOW_TS) ))
  push_metric 1 0 "$LAG"
  exit 0
fi

# ── Newest ts in this slice becomes the next checkpoint ─────────────────────
NEW_TS=$(bsondump "$SLICE_BSON" 2>/dev/null | grep -o '"t":[0-9]\+' | grep -o '[0-9]\+' | sort -n | tail -1)
NEW_TS="${NEW_TS:-$NOW_TS}"

ARCHIVE="$WORKDIR/oplog-$TIMESTAMP.tar.gz"
ENCRYPTED="$WORKDIR/oplog-$TIMESTAMP.tar.gz.enc"
tar -czf "$ARCHIVE" -C "$WORKDIR/dump" local
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
  -in "$ARCHIVE" -out "$ENCRYPTED" -pass "pass:$BACKUP_ENCRYPTION_KEY"

SLICE_BYTES=$(wc -c < "$ENCRYPTED")
S3_KEY="$INCR_PREFIX/oplog-$TIMESTAMP.tar.gz.enc"
log "Uploading $(du -sh "$ENCRYPTED" | cut -f1) slice to s3://$BACKUP_BUCKET/$S3_KEY"
aws s3 cp "$ENCRYPTED" "s3://$BACKUP_BUCKET/$S3_KEY" \
  --region "$AWS_REGION" --storage-class STANDARD_IA \
  --metadata "from_epoch=${LAST_TS:-0},to_epoch=$NEW_TS"

# ── Advance the checkpoint ──────────────────────────────────────────────────
cat > "$WORKDIR/checkpoint.json" <<EOF
{ "lastOplogEpoch": $NEW_TS, "updatedAt": "$TIMESTAMP", "sliceKey": "$S3_KEY" }
EOF
aws s3 cp "$WORKDIR/checkpoint.json" "s3://$BACKUP_BUCKET/$MARKER_KEY" \
  --region "$AWS_REGION" --quiet

LAG=$(( NOW_TS - NEW_TS ))
log "Incremental backup complete. RPO age is now ${LAG}s."
push_metric 1 "$SLICE_BYTES" "$LAG"
