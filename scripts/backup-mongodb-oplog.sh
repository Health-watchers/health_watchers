#!/bin/bash
# scripts/backup-mongodb-oplog.sh
# Continuous MongoDB oplog archiving for Point-in-Time Recovery (PITR)
# Archives oplog entries to S3 in 5-minute increments
# Usage: ./scripts/backup-mongodb-oplog.sh [--daemon]
# Required env vars: MONGO_URI, BACKUP_ENCRYPTION_KEY, BACKUP_BUCKET
# Optional env vars: AWS_REGION (default: us-east-1), OPLOG_INTERVAL_SECONDS (default: 300)

set -euo pipefail

OPLOG_INTERVAL="${OPLOG_INTERVAL_SECONDS:-300}"  # 5 minutes
BACKUP_DIR="${BACKUP_DIR:-/tmp/oplog-backups}"
S3_PREFIX="${S3_PREFIX:-mongodb-oplog}"
DAEMON_MODE=false

if [[ "${1:-}" == "--daemon" ]]; then
  DAEMON_MODE=true
fi

# ── Validate required env vars ────────────────────────────────────────────────
: "${MONGO_URI:?MONGO_URI is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [OPLOG] $*"; }

mkdir -p "$BACKUP_DIR"

# ── Get last archived oplog timestamp ─────────────────────────────────────────
get_last_oplog_timestamp() {
  # Check S3 for the latest oplog archive to resume from
  local latest=$(aws s3 ls "s3://$BACKUP_BUCKET/$S3_PREFIX/" \
    --region "${AWS_REGION:-us-east-1}" \
    --recursive | sort | tail -1 | awk '{print $4}' || echo "")
  
  if [[ -z "$latest" ]]; then
    log "No previous oplog archives found, starting fresh"
    echo ""
    return
  fi
  
  # Extract timestamp from filename: mongodb-oplog/oplog_1234567890_1234567891.bson.enc
  local basename=$(basename "$latest" .bson.enc)
  local end_ts=$(echo "$basename" | cut -d'_' -f3)
  echo "$end_ts"
}

# ── Archive oplog segment ─────────────────────────────────────────────────────
archive_oplog_segment() {
  local start_ts=$1
  local end_ts=$2
  local timestamp=$(date +%Y%m%d_%H%M%S)
  local oplog_file="$BACKUP_DIR/oplog_${start_ts}_${end_ts}.bson"
  local encrypted_file="$BACKUP_DIR/oplog_${start_ts}_${end_ts}.bson.enc"
  
  log "Archiving oplog from $start_ts to $end_ts..."
  
  # Use mongodump to dump oplog with timestamp range
  # The oplog contains all operations within the time range
  if [[ -n "$start_ts" ]]; then
    mongodump --uri="$MONGO_URI" \
      --db=local \
      --collection=oplog.rs \
      --query="{\"ts\": {\"\$gt\": Timestamp($start_ts, 0), \"\$lte\": Timestamp($end_ts, 0)}}" \
      --out="$BACKUP_DIR/temp_$timestamp" \
      --quiet 2>/dev/null || {
      log "Warning: Failed to dump oplog segment, may be empty"
      rm -rf "$BACKUP_DIR/temp_$timestamp"
      return 0
    }
  else
    # First run - get current oplog
    mongodump --uri="$MONGO_URI" \
      --db=local \
      --collection=oplog.rs \
      --query="{\"ts\": {\"\$lte\": Timestamp($end_ts, 0)}}" \
      --out="$BACKUP_DIR/temp_$timestamp" \
      --quiet 2>/dev/null || {
      log "Warning: Failed to dump initial oplog"
      rm -rf "$BACKUP_DIR/temp_$timestamp"
      return 0
    }
  fi
  
  # Move the oplog.rs.bson file to our target location
  if [[ -f "$BACKUP_DIR/temp_$timestamp/local/oplog.rs.bson" ]]; then
    mv "$BACKUP_DIR/temp_$timestamp/local/oplog.rs.bson" "$oplog_file"
    rm -rf "$BACKUP_DIR/temp_$timestamp"
    
    local size=$(du -sh "$oplog_file" | cut -f1)
    log "Oplog segment dumped: $size"
    
    # Encrypt the oplog
    openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
      -in "$oplog_file" -out "$encrypted_file" \
      -pass "pass:$BACKUP_ENCRYPTION_KEY"
    
    # Upload to S3
    local s3_key="$S3_PREFIX/oplog_${start_ts}_${end_ts}.bson.enc"
    aws s3 cp "$encrypted_file" "s3://$BACKUP_BUCKET/$s3_key" \
      --region "${AWS_REGION:-us-east-1}" \
      --storage-class STANDARD_IA \
      --metadata "start_ts=$start_ts,end_ts=$end_ts,timestamp=$timestamp"
    
    log "Uploaded to s3://$BACKUP_BUCKET/$s3_key"
    
    # Cleanup
    rm -f "$oplog_file" "$encrypted_file"
  else
    log "No oplog entries in this segment (empty)"
    rm -rf "$BACKUP_DIR/temp_$timestamp"
  fi
}

# ── Get current oplog timestamp ───────────────────────────────────────────────
get_current_oplog_timestamp() {
  mongosh "$MONGO_URI" --quiet --eval "
    const latest = db.getSiblingDB('local').oplog.rs.find().sort({ts: -1}).limit(1).toArray();
    if (latest.length > 0) {
      print(latest[0].ts.getTime());
    } else {
      print('0');
    }
  " 2>/dev/null || echo "0"
}

# ── Main execution ────────────────────────────────────────────────────────────
if [[ "$DAEMON_MODE" == true ]]; then
  log "Starting continuous oplog archiving (interval: ${OPLOG_INTERVAL}s)"
  
  # Get the last archived timestamp or start fresh
  LAST_TS=$(get_last_oplog_timestamp)
  
  while true; do
    # Get current oplog timestamp
    CURRENT_TS=$(get_current_oplog_timestamp)
    
    if [[ "$CURRENT_TS" == "0" ]]; then
      log "Warning: Could not read oplog timestamp, retrying..."
      sleep 30
      continue
    fi
    
    # Archive the segment from last timestamp to now
    if [[ -z "$LAST_TS" ]]; then
      log "Initial archive: capturing oplog up to timestamp $CURRENT_TS"
      LAST_TS="$CURRENT_TS"
    else
      archive_oplog_segment "$LAST_TS" "$CURRENT_TS"
      LAST_TS="$CURRENT_TS"
    fi
    
    # Wait for next interval
    sleep "$OPLOG_INTERVAL"
  done
else
  # Single run mode - archive from last known point to now
  log "Running single oplog archive..."
  
  LAST_TS=$(get_last_oplog_timestamp)
  CURRENT_TS=$(get_current_oplog_timestamp)
  
  if [[ "$CURRENT_TS" == "0" ]]; then
    log "Error: Could not read oplog timestamp"
    exit 1
  fi
  
  if [[ -z "$LAST_TS" ]]; then
    log "First run: storing current oplog position $CURRENT_TS for next run"
    # Create a marker file to establish starting point
    echo "$CURRENT_TS" > "$BACKUP_DIR/last_oplog_ts.txt"
    aws s3 cp "$BACKUP_DIR/last_oplog_ts.txt" \
      "s3://$BACKUP_BUCKET/$S3_PREFIX/last_oplog_ts.txt" \
      --region "${AWS_REGION:-us-east-1}"
    rm -f "$BACKUP_DIR/last_oplog_ts.txt"
  else
    archive_oplog_segment "$LAST_TS" "$CURRENT_TS"
  fi
  
  log "✅ Oplog archive completed"
fi
