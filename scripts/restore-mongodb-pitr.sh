#!/bin/bash
# scripts/restore-mongodb-pitr.sh
# Point-in-Time Recovery (PITR) for MongoDB
# Restores database to a specific timestamp using base backup + oplog replay
# Usage: ./scripts/restore-mongodb-pitr.sh --timestamp "2024-01-15T14:30:00Z" [--target-uri mongodb://...]
# Required env vars: MONGO_URI (source), BACKUP_ENCRYPTION_KEY, BACKUP_BUCKET
# Optional env vars: AWS_REGION (default: us-east-1), TARGET_MONGO_URI (defaults to MONGO_URI)

set -euo pipefail

TIMESTAMP=""
TARGET_URI=""
DRY_RUN=false
RESTORE_DIR="/tmp/pitr-restore-$(date +%s)"
S3_PREFIX_BASE="${S3_PREFIX:-mongodb}"
S3_PREFIX_OPLOG="${S3_PREFIX:-mongodb-oplog}"

# ── Parse arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --timestamp)
      TIMESTAMP="$2"
      shift 2
      ;;
    --target-uri)
      TARGET_URI="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --timestamp '2024-01-15T14:30:00Z' [--target-uri mongodb://...] [--dry-run]"
      exit 1
      ;;
  esac
done

# ── Validate required parameters ──────────────────────────────────────────────
if [[ -z "$TIMESTAMP" ]]; then
  echo "Error: --timestamp is required"
  echo "Usage: $0 --timestamp '2024-01-15T14:30:00Z' [--target-uri mongodb://...] [--dry-run]"
  exit 1
fi

: "${MONGO_URI:?MONGO_URI is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"

TARGET_URI="${TARGET_URI:-$MONGO_URI}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [PITR] $*"; }
error() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [PITR] ❌ ERROR: $*"; }
success() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [PITR] ✅ $*"; }

cleanup() {
  log "Cleaning up temporary files..."
  rm -rf "$RESTORE_DIR"
}
trap cleanup EXIT

mkdir -p "$RESTORE_DIR"

# ── Convert timestamp to Unix epoch ───────────────────────────────────────────
log "Target recovery timestamp: $TIMESTAMP"
TARGET_EPOCH=$(date -d "$TIMESTAMP" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$TIMESTAMP" +%s)
log "Target epoch: $TARGET_EPOCH"

# ── Step 1: Find the appropriate base backup ──────────────────────────────────
log "Finding base backup before $TIMESTAMP..."

AVAILABLE_BACKUPS=$(aws s3 ls "s3://$BACKUP_BUCKET/$S3_PREFIX_BASE/" \
  --region "${AWS_REGION:-us-east-1}" \
  --recursive | grep '\.enc$' | awk '{print $4}' | sort)

SELECTED_BACKUP=""
for backup in $AVAILABLE_BACKUPS; do
  # Extract timestamp from filename: mongodb/20240115_143000.enc
  backup_basename=$(basename "$backup" .enc)
  backup_date=$(echo "$backup_basename" | cut -d'_' -f1)
  backup_time=$(echo "$backup_basename" | cut -d'_' -f2)
  
  # Convert to comparable format YYYYMMDDHHMMSS
  backup_ts="${backup_date}${backup_time}"
  target_ts=$(date -d "$TIMESTAMP" +%Y%m%d%H%M%S 2>/dev/null || \
              date -j -f "%Y-%m-%dT%H:%M:%SZ" "$TIMESTAMP" +%Y%m%d%H%M%S)
  
  # Select the most recent backup before the target timestamp
  if [[ "$backup_ts" -le "$target_ts" ]]; then
    SELECTED_BACKUP="$backup"
  else
    break
  fi
done

if [[ -z "$SELECTED_BACKUP" ]]; then
  error "No suitable base backup found before $TIMESTAMP"
  exit 1
fi

log "Selected base backup: $SELECTED_BACKUP"

# ── Step 2: Download and restore base backup ──────────────────────────────────
log "Downloading base backup..."
ENCRYPTED_FILE="$RESTORE_DIR/base_backup.enc"
aws s3 cp "s3://$BACKUP_BUCKET/$SELECTED_BACKUP" "$ENCRYPTED_FILE" \
  --region "${AWS_REGION:-us-east-1}" \
  --quiet

log "Decrypting base backup..."
ARCHIVE_FILE="$RESTORE_DIR/base_backup.tar.gz"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in "$ENCRYPTED_FILE" -out "$ARCHIVE_FILE" \
  -pass "pass:$BACKUP_ENCRYPTION_KEY"

log "Extracting base backup..."
tar -xzf "$ARCHIVE_FILE" -C "$RESTORE_DIR"

# Find the extracted backup directory
BACKUP_DIR=$(find "$RESTORE_DIR" -maxdepth 1 -type d -name "20*" | head -1)

if [[ -z "$BACKUP_DIR" ]]; then
  error "Could not find extracted backup directory"
  exit 1
fi

log "Base backup extracted to: $BACKUP_DIR"

if [[ "$DRY_RUN" == true ]]; then
  log "[DRY RUN] Would restore base backup to: $TARGET_URI"
else
  log "Restoring base backup to target database..."
  mongorestore --uri="$TARGET_URI" "$BACKUP_DIR" --drop --quiet
  success "Base backup restored"
fi

# ── Step 3: Find and download oplog archives ──────────────────────────────────
log "Finding oplog archives to replay..."

# Get backup timestamp to start from
BACKUP_TS=$(basename "$SELECTED_BACKUP" .enc | sed 's/_//g')
BACKUP_EPOCH=$(date -d "${BACKUP_TS:0:8} ${BACKUP_TS:8:2}:${BACKUP_TS:10:2}:${BACKUP_TS:12:2}" +%s 2>/dev/null || \
               date -j -f "%Y%m%d%H%M%S" "$BACKUP_TS" +%s)

log "Base backup epoch: $BACKUP_EPOCH, Target epoch: $TARGET_EPOCH"

# List all oplog archives
OPLOG_FILES=$(aws s3 ls "s3://$BACKUP_BUCKET/$S3_PREFIX_OPLOG/" \
  --region "${AWS_REGION:-us-east-1}" \
  --recursive | grep 'oplog_.*\.bson\.enc$' | awk '{print $4}' | sort)

OPLOGS_TO_REPLAY=()
for oplog_file in $OPLOG_FILES; do
  # Extract timestamps from filename: mongodb-oplog/oplog_1234567890_1234567891.bson.enc
  oplog_basename=$(basename "$oplog_file" .bson.enc)
  start_ts=$(echo "$oplog_basename" | cut -d'_' -f2)
  end_ts=$(echo "$oplog_basename" | cut -d'_' -f3)
  
  # Check if this oplog segment is within our replay range
  if [[ "$end_ts" -ge "$BACKUP_EPOCH" ]] && [[ "$start_ts" -le "$TARGET_EPOCH" ]]; then
    OPLOGS_TO_REPLAY+=("$oplog_file")
    log "Will replay: $oplog_file (range: $start_ts - $end_ts)"
  fi
done

if [[ ${#OPLOGS_TO_REPLAY[@]} -eq 0 ]]; then
  log "No oplog archives to replay (backup is after target time or no oplogs available)"
  success "PITR restore completed (base backup only)"
  exit 0
fi

# ── Step 4: Download and decrypt oplog archives ───────────────────────────────
log "Downloading ${#OPLOGS_TO_REPLAY[@]} oplog archive(s)..."
OPLOG_DIR="$RESTORE_DIR/oplogs"
mkdir -p "$OPLOG_DIR"

for oplog_file in "${OPLOGS_TO_REPLAY[@]}"; do
  oplog_basename=$(basename "$oplog_file")
  encrypted_oplog="$OPLOG_DIR/${oplog_basename}"
  decrypted_oplog="$OPLOG_DIR/${oplog_basename%.enc}"
  
  aws s3 cp "s3://$BACKUP_BUCKET/$oplog_file" "$encrypted_oplog" \
    --region "${AWS_REGION:-us-east-1}" \
    --quiet
  
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -in "$encrypted_oplog" -out "$decrypted_oplog" \
    -pass "pass:$BACKUP_ENCRYPTION_KEY"
  
  rm "$encrypted_oplog"
  log "Downloaded and decrypted: $oplog_basename"
done

# ── Step 5: Replay oplog entries up to target timestamp ───────────────────────
log "Replaying oplog entries up to $TIMESTAMP..."

# Combine all oplog files
COMBINED_OPLOG="$OPLOG_DIR/combined_oplog.bson"
cat "$OPLOG_DIR"/oplog_*.bson > "$COMBINED_OPLOG" 2>/dev/null || touch "$COMBINED_OPLOG"

if [[ ! -s "$COMBINED_OPLOG" ]]; then
  log "Warning: No oplog entries found to replay"
  success "PITR restore completed (base backup only)"
  exit 0
fi

# Create a temporary directory for oplog replay
OPLOG_RESTORE_DIR="$RESTORE_DIR/oplog_restore"
mkdir -p "$OPLOG_RESTORE_DIR/local"
cp "$COMBINED_OPLOG" "$OPLOG_RESTORE_DIR/local/oplog.rs.bson"

if [[ "$DRY_RUN" == true ]]; then
  log "[DRY RUN] Would replay oplog entries to: $TARGET_URI"
  log "[DRY RUN] Oplog file size: $(du -sh "$COMBINED_OPLOG" | cut -f1)"
else
  log "Applying oplog entries..."
  
  # Use mongorestore with --oplogReplay and --oplogLimit to stop at target timestamp
  # Convert target timestamp to MongoDB timestamp format
  mongorestore --uri="$TARGET_URI" \
    --oplogReplay \
    --oplogLimit="$TARGET_EPOCH:0" \
    "$OPLOG_RESTORE_DIR" \
    --quiet 2>&1 || {
    error "Failed to replay oplog - some entries may not have been applied"
    exit 1
  }
  
  success "Oplog replay completed"
fi

# ── Step 6: Verify restore ────────────────────────────────────────────────────
if [[ "$DRY_RUN" == false ]]; then
  log "Verifying restored database..."
  
  # Basic connectivity and collection count check
  DB_COUNT=$(mongosh "$TARGET_URI" --quiet --eval "
    const dbs = db.adminCommand('listDatabases');
    print(dbs.databases.length);
  " 2>/dev/null || echo "0")
  
  log "Databases found: $DB_COUNT"
  
  if [[ "$DB_COUNT" -gt 0 ]]; then
    success "Database verification passed"
  else
    error "Database verification failed - no databases found"
    exit 1
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
log "═══════════════════════════════════════════════════════════════"
success "Point-in-Time Recovery completed successfully!"
log "═══════════════════════════════════════════════════════════════"
log "Recovery Details:"
log "  - Target Timestamp: $TIMESTAMP"
log "  - Base Backup: $SELECTED_BACKUP"
log "  - Oplog Archives Replayed: ${#OPLOGS_TO_REPLAY[@]}"
log "  - Target Database: $TARGET_URI"
if [[ "$DRY_RUN" == true ]]; then
  log "  - Mode: DRY RUN (no changes made)"
fi
log "═══════════════════════════════════════════════════════════════"
