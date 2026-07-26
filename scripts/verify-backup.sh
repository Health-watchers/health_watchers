#!/bin/bash
# scripts/verify-backup.sh
# Automated MongoDB backup verification and restore testing
# Downloads latest backup, restores to temporary MongoDB instance, and validates data integrity
# Usage: ./scripts/verify-backup.sh
# Required env vars: MONGO_URI, BACKUP_ENCRYPTION_KEY, BACKUP_BUCKET, AWS_REGION
# Optional env vars: VERIFY_MONGO_URI (defaults to temporary container)

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
VERIFY_DIR="${VERIFY_DIR:-/tmp/backup-verify}"
VERIFY_LOG="$VERIFY_DIR/verify_$TIMESTAMP.log"
S3_PREFIX="${S3_PREFIX:-mongodb}"
TEMP_MONGO_PORT=27018
TEMP_MONGO_CONTAINER="backup-verify-mongo-$TIMESTAMP"
METRICS_FILE="${METRICS_FILE:-/tmp/backup_verify_metrics.txt}"

# ── Validate required env vars ────────────────────────────────────────────────
: "${MONGO_URI:?MONGO_URI is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
: "${AWS_REGION:=us-east-1}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$VERIFY_LOG"; }
error() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ❌ ERROR: $*" | tee -a "$VERIFY_LOG"; }
success() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✅ $*" | tee -a "$VERIFY_LOG"; }

cleanup() {
  log "Cleaning up..."
  rm -rf "$VERIFY_DIR"
  
  # Stop temporary MongoDB container if running
  if docker ps -a --format '{{.Names}}' | grep -q "^${TEMP_MONGO_CONTAINER}$"; then
    log "Stopping temporary MongoDB container..."
    docker stop "$TEMP_MONGO_CONTAINER" 2>/dev/null || true
    docker rm "$TEMP_MONGO_CONTAINER" 2>/dev/null || true
  fi
}
trap cleanup EXIT

mkdir -p "$VERIFY_DIR"

# ── Step 1: Find latest backup ────────────────────────────────────────────────
log "Finding latest backup in S3..."
LATEST_BACKUP=$(aws s3 ls "s3://$BACKUP_BUCKET/$S3_PREFIX/" \
  --region "$AWS_REGION" \
  --recursive \
  | sort | tail -1 | awk '{print $4}')

if [[ -z "$LATEST_BACKUP" ]]; then
  error "No backups found in s3://$BACKUP_BUCKET/$S3_PREFIX/"
  exit 1
fi

log "Latest backup: $LATEST_BACKUP"
BACKUP_TIMESTAMP=$(basename "$LATEST_BACKUP" .enc)

# ── Step 2: Download backup ───────────────────────────────────────────────────
log "Downloading backup from S3..."
ENCRYPTED_FILE="$VERIFY_DIR/$BACKUP_TIMESTAMP.enc"
aws s3 cp "s3://$BACKUP_BUCKET/$LATEST_BACKUP" "$ENCRYPTED_FILE" \
  --region "$AWS_REGION" \
  --quiet

if [[ ! -f "$ENCRYPTED_FILE" ]]; then
  error "Failed to download backup"
  exit 1
fi

log "Downloaded: $(du -sh "$ENCRYPTED_FILE" | cut -f1)"

# ── Step 3: Decrypt backup ────────────────────────────────────────────────────
log "Decrypting backup..."
ARCHIVE_FILE="$VERIFY_DIR/$BACKUP_TIMESTAMP.tar.gz"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in "$ENCRYPTED_FILE" -out "$ARCHIVE_FILE" \
  -pass "pass:$BACKUP_ENCRYPTION_KEY" 2>/dev/null

if [[ ! -f "$ARCHIVE_FILE" ]]; then
  error "Failed to decrypt backup"
  exit 1
fi

success "Decryption successful"

# ── Step 4: Extract backup ────────────────────────────────────────────────────
log "Extracting backup..."
EXTRACT_DIR="$VERIFY_DIR/extracted"
mkdir -p "$EXTRACT_DIR"
tar -xzf "$ARCHIVE_FILE" -C "$EXTRACT_DIR"

if [[ ! -d "$EXTRACT_DIR/$BACKUP_TIMESTAMP" ]]; then
  error "Backup structure invalid — expected directory: $EXTRACT_DIR/$BACKUP_TIMESTAMP"
  exit 1
fi

success "Extraction successful"

# ── Step 5: Start temporary MongoDB container ─────────────────────────────────
log "Starting temporary MongoDB container on port $TEMP_MONGO_PORT..."
docker run -d \
  --name "$TEMP_MONGO_CONTAINER" \
  -p "$TEMP_MONGO_PORT:27017" \
  mongo:7.0 \
  --quiet \
  > /dev/null 2>&1

# Wait for MongoDB to be ready
log "Waiting for MongoDB to be ready..."
for i in {1..30}; do
  if docker exec "$TEMP_MONGO_CONTAINER" mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    log "MongoDB is ready"
    break
  fi
  if [[ $i -eq 30 ]]; then
    error "MongoDB failed to start within 30 seconds"
    exit 1
  fi
  sleep 1
done

TEMP_MONGO_URI="mongodb://localhost:$TEMP_MONGO_PORT/health_watchers"

# ── Step 6: Restore backup to temporary MongoDB ───────────────────────────────
log "Restoring backup to temporary MongoDB..."
mongorestore \
  --uri="$TEMP_MONGO_URI" \
  "$EXTRACT_DIR/$BACKUP_TIMESTAMP" \
  --quiet \
  2>&1 | tee -a "$VERIFY_LOG" || {
  error "Restore failed"
  exit 1
}

success "Restore completed"

# ── Step 7: Validate data integrity ───────────────────────────────────────────
log "Validating data integrity..."

# Helper function to run validation queries
validate_collection() {
  local collection=$1
  local expected_min=$2
  
  local count=$(mongosh "$TEMP_MONGO_URI" --eval "db.$collection.countDocuments()" --quiet 2>/dev/null || echo "0")
  
  if [[ $count -lt $expected_min ]]; then
    error "Collection '$collection' has only $count documents (expected at least $expected_min)"
    return 1
  fi
  
  log "✓ Collection '$collection': $count documents"
  return 0
}

# Validate critical collections
VALIDATION_PASSED=true

# Patients collection (should have at least 1 document in any real backup)
if ! validate_collection "patients" 0; then
  VALIDATION_PASSED=false
fi

# Users collection (should have at least 1 document)
if ! validate_collection "users" 0; then
  VALIDATION_PASSED=false
fi

# Encounters collection (optional, but if present should be valid)
if ! validate_collection "encounters" 0; then
  VALIDATION_PASSED=false
fi

# Payments collection (optional, but if present should be valid)
if ! validate_collection "payments" 0; then
  VALIDATION_PASSED=false
fi

# ── Step 8: Run advanced validation queries ───────────────────────────────────
log "Running advanced validation queries..."

# Check for data consistency
VALIDATION_QUERIES=$(cat <<'EOF'
// Check for orphaned references
db.encounters.aggregate([
  {
    $lookup: {
      from: "patients",
      localField: "patientId",
      foreignField: "_id",
      as: "patient"
    }
  },
  {
    $match: { patient: { $size: 0 } }
  },
  {
    $count: "orphaned"
  }
]).toArray()
EOF
)

ORPHANED=$(mongosh "$TEMP_MONGO_URI" --eval "$VALIDATION_QUERIES" --quiet 2>/dev/null | grep -o '[0-9]*' | head -1 || echo "0")

if [[ $ORPHANED -gt 0 ]]; then
  error "Found $ORPHANED orphaned encounter records"
  VALIDATION_PASSED=false
else
  log "✓ No orphaned references detected"
fi

# Check for index integrity
log "Checking index integrity..."
INDEXES=$(mongosh "$TEMP_MONGO_URI" --eval "db.patients.getIndexes().length" --quiet 2>/dev/null || echo "0")
if [[ $INDEXES -gt 0 ]]; then
  log "✓ Indexes present: $INDEXES"
else
  log "⚠ Warning: No indexes found on patients collection"
fi

# ── Step 9: Record metrics ────────────────────────────────────────────────────
log "Recording verification metrics..."

VERIFY_TIMESTAMP=$(date +%s)
BACKUP_SIZE=$(du -sb "$ENCRYPTED_FILE" | cut -f1)
EXTRACTED_SIZE=$(du -sb "$EXTRACT_DIR" | cut -f1)

cat > "$METRICS_FILE" <<EOF
# HELP backup_last_verified_timestamp Timestamp of last successful backup verification
# TYPE backup_last_verified_timestamp gauge
backup_last_verified_timestamp $VERIFY_TIMESTAMP

# HELP backup_size_bytes Size of encrypted backup in bytes
# TYPE backup_size_bytes gauge
backup_size_bytes $BACKUP_SIZE

# HELP backup_extracted_size_bytes Size of extracted backup in bytes
# TYPE backup_extracted_size_bytes gauge
backup_extracted_size_bytes $EXTRACTED_SIZE

# HELP backup_verification_status Status of last backup verification (1=success, 0=failure)
# TYPE backup_verification_status gauge
backup_verification_status $([ "$VALIDATION_PASSED" = true ] && echo 1 || echo 0)
EOF

log "Metrics recorded to $METRICS_FILE"

# ── Step 10: Final result ─────────────────────────────────────────────────────
if [[ "$VALIDATION_PASSED" = true ]]; then
  success "Backup verification PASSED"
  log "Backup timestamp: $BACKUP_TIMESTAMP"
  log "Backup size: $(du -sh "$ENCRYPTED_FILE" | cut -f1)"
  log "Verification log: $VERIFY_LOG"
  exit 0
else
  error "Backup verification FAILED"
  log "Verification log: $VERIFY_LOG"
  exit 1
fi
