#!/bin/bash
# scripts/backup-mongodb.sh
# Automated MongoDB backup with encryption and S3 upload
# Usage: ./scripts/backup-mongodb.sh [--verify]
# Required env vars: MONGO_URI, BACKUP_ENCRYPTION_KEY, BACKUP_BUCKET
# Optional env vars: AWS_REGION (default: us-east-1), BACKUP_RETENTION_DAYS (default: 30)

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/tmp/backups}"
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"
ARCHIVE="$BACKUP_PATH.tar.gz"
ENCRYPTED="$BACKUP_PATH.enc"
S3_PREFIX="${S3_PREFIX:-mongodb}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
VERIFY_MODE="${1:-}"

# ── Validate required env vars ────────────────────────────────────────────────
: "${MONGO_URI:?MONGO_URI is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

cleanup() {
  log "Cleaning up local files..."
  rm -rf "$BACKUP_PATH" "$ARCHIVE" "$ENCRYPTED"
}
trap cleanup EXIT

mkdir -p "$BACKUP_DIR"

# ── Dump ──────────────────────────────────────────────────────────────────────
log "Starting MongoDB dump (timestamp: $TIMESTAMP)..."
mongodump --uri="$MONGO_URI" --out="$BACKUP_PATH" --quiet
log "Dump complete."

# ── Compress ──────────────────────────────────────────────────────────────────
log "Compressing backup..."
tar -czf "$ARCHIVE" -C "$BACKUP_DIR" "$TIMESTAMP"
log "Compressed: $(du -sh "$ARCHIVE" | cut -f1)"

# ── Encrypt ───────────────────────────────────────────────────────────────────
log "Encrypting backup (AES-256-CBC)..."
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
  -in "$ARCHIVE" -out "$ENCRYPTED" \
  -pass "pass:$BACKUP_ENCRYPTION_KEY"
log "Encryption complete."

# ── Upload to S3 ──────────────────────────────────────────────────────────────
S3_KEY="$S3_PREFIX/$TIMESTAMP.enc"
log "Uploading to s3://$BACKUP_BUCKET/$S3_KEY ..."
aws s3 cp "$ENCRYPTED" "s3://$BACKUP_BUCKET/$S3_KEY" \
  --region "${AWS_REGION:-us-east-1}" \
  --storage-class STANDARD_IA \
  --metadata "timestamp=$TIMESTAMP,source=health-watchers"
log "Upload complete."

# ── Enforce retention policy ──────────────────────────────────────────────────
log "Enforcing $RETENTION_DAYS-day retention policy..."
CUTOFF=$(date -u -d "$RETENTION_DAYS days ago" +%Y%m%d 2>/dev/null || \
         date -u -v-"${RETENTION_DAYS}d" +%Y%m%d)  # macOS fallback

aws s3 ls "s3://$BACKUP_BUCKET/$S3_PREFIX/" --region "${AWS_REGION:-us-east-1}" | \
  awk '{print $4}' | \
  while read -r key; do
    file_date="${key:0:8}"
    if [[ "$file_date" < "$CUTOFF" ]]; then
      log "Deleting expired backup: $key"
      aws s3 rm "s3://$BACKUP_BUCKET/$S3_PREFIX/$key" --region "${AWS_REGION:-us-east-1}"
    fi
  done

# ── Verify mode: test restore ─────────────────────────────────────────────────
if [[ "$VERIFY_MODE" == "--verify" ]]; then
  log "Running restore verification..."
  VERIFY_DIR="$BACKUP_DIR/verify_$TIMESTAMP"
  VERIFY_ARCHIVE="$BACKUP_DIR/verify_$TIMESTAMP.tar.gz"
  mkdir -p "$VERIFY_DIR"

  # Download and decrypt
  aws s3 cp "s3://$BACKUP_BUCKET/$S3_KEY" "$ENCRYPTED" --region "${AWS_REGION:-us-east-1}"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -in "$ENCRYPTED" -out "$VERIFY_ARCHIVE" \
    -pass "pass:$BACKUP_ENCRYPTION_KEY"
  tar -xzf "$VERIFY_ARCHIVE" -C "$VERIFY_DIR"

  # Verify dump structure
  if [[ -d "$VERIFY_DIR/$TIMESTAMP" ]]; then
    log "✅ Restore verification PASSED — backup is valid."
  else
    log "❌ Restore verification FAILED — backup may be corrupt."
    rm -rf "$VERIFY_DIR" "$VERIFY_ARCHIVE"
    exit 1
  fi
  rm -rf "$VERIFY_DIR" "$VERIFY_ARCHIVE"
fi

log "✅ Backup completed successfully: s3://$BACKUP_BUCKET/$S3_KEY"
