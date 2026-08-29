#!/bin/bash
set -euo pipefail

# Backup Verification and Testing Script

BACKUP_DIR="${1:?Backup directory required}"
RESTORE_DB="${2:-health_watchers_verify}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017}"
REPORT_FILE="${3:-backup-verification-report.json}"

log_info() {
  echo "[INFO] $*"
}

log_success() {
  echo "[SUCCESS] $*"
}

log_error() {
  echo "[ERROR] $*" >&2
}

# Check backup integrity
verify_backup_integrity() {
  local backup_file="$1"
  
  log_info "Verifying backup integrity: $backup_file"
  
  if [[ ! -f "$backup_file" ]]; then
    log_error "Backup file not found: $backup_file"
    return 1
  fi
  
  # Check file size
  local size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
  if [[ $size -lt 1000 ]]; then
    log_error "Backup file too small: $size bytes"
    return 1
  fi
  
  log_success "Backup integrity verified"
  return 0
}

# Test restore from backup
test_restore() {
  local backup_file="$1"
  local restore_db="$2"
  
  log_info "Testing restore from: $backup_file"
  
  # Restore to temporary database
  mongorestore --uri="$MONGO_URI" \
    --archive="$backup_file" \
    --gzip \
    --nsFrom="health_watchers.*" \
    --nsTo="$restore_db.*" \
    --quiet || return 1
  
  log_success "Restore test completed"
  return 0
}

# Verify restored data
verify_restored_data() {
  local restore_db="$1"
  
  log_info "Verifying restored data"
  
  # Check collection count
  local collections=$(mongosh "$MONGO_URI" "$restore_db" --quiet --eval "db.getCollectionNames().length" 2>/dev/null || echo "0")
  
  if [[ $collections -eq 0 ]]; then
    log_error "No collections found in restored database"
    return 1
  fi
  
  # Check document count in main collections
  local patients=$(mongosh "$MONGO_URI" "$restore_db" --quiet --eval "db.patients.estimatedDocumentCount()" 2>/dev/null || echo "0")
  
  log_success "Restored data verified: $collections collections, $patients patient records"
  return 0
}

# Cleanup temporary database
cleanup_restore() {
  local restore_db="$1"
  
  log_info "Cleaning up temporary database"
  
  mongosh "$MONGO_URI" --eval "db.dropDatabase()" "$restore_db" --quiet || true
  
  log_success "Cleanup completed"
}

# Generate report
generate_report() {
  local report_file="$1"
  local backup_file="$2"
  local status="$3"
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  cat > "$report_file" <<EOF
{
  "timestamp": "$timestamp",
  "backup_file": "$backup_file",
  "status": "$status",
  "database": "$RESTORE_DB"
}
EOF
  
  log_success "Report generated: $report_file"
}

# Main verification flow
main() {
  local backup_file="$BACKUP_DIR/health_watchers_backup.archive"
  local status="FAILED"
  
  if verify_backup_integrity "$backup_file" && \
     test_restore "$backup_file" "$RESTORE_DB" && \
     verify_restored_data "$RESTORE_DB"; then
    status="SUCCESS"
  fi
  
  cleanup_restore "$RESTORE_DB"
  generate_report "$REPORT_FILE" "$backup_file" "$status"
  
  if [[ "$status" == "SUCCESS" ]]; then
    log_success "Backup verification completed successfully"
    return 0
  else
    log_error "Backup verification failed"
    return 1
  fi
}

main "$@"
