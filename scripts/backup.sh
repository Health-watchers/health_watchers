#!/usr/bin/env bash
# Health Watchers — MongoDB backup script
# Usage: ./scripts/backup.sh
# Env vars: MONGO_URI, BACKUP_DIR (optional, default: /var/backups/health-watchers)

set -euo pipefail

MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/health_watchers}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/health-watchers}"
DATE=$(date +%Y-%m-%d)
ARCHIVE="${BACKUP_DIR}/backup-${DATE}.tar.gz"
DUMP_DIR="${BACKUP_DIR}/dump-${DATE}"
RETENTION_DAYS=30

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u +%FT%TZ)] Starting backup..."

# Dump
mongodump --uri="${MONGO_URI}" --out="${DUMP_DIR}" --gzip

# Compress
tar -czf "${ARCHIVE}" -C "${BACKUP_DIR}" "dump-${DATE}"
rm -rf "${DUMP_DIR}"

echo "[$(date -u +%FT%TZ)] Backup saved: ${ARCHIVE}"

# Rotate: remove backups older than retention period
find "${BACKUP_DIR}" -name "backup-*.tar.gz" -mtime "+${RETENTION_DAYS}" -delete
echo "[$(date -u +%FT%TZ)] Rotation complete (${RETENTION_DAYS}-day retention)."
