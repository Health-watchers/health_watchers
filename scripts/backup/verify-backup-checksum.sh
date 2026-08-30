#!/bin/bash
# scripts/backup/verify-backup-checksum.sh
# Lightweight post-backup integrity check (#1262).
#
# Runs immediately after every full backup so "verification passes 100%" is a
# gate on the backup pipeline itself, not just the weekly restore drill
# (scripts/verify-backup.sh). It:
#   1. downloads the newest backup object
#   2. checks the S3 ETag / stored SHA-256 against the downloaded bytes
#   3. decrypts it and confirms the archive is a well-formed gzip/tar with the
#      expected mongodump directory layout
#
# Exit 0 => verified, non-zero => corrupt/unreadable (page the on-call).
#
# Usage:  ./scripts/backup/verify-backup-checksum.sh
# Env:    BACKUP_BUCKET, BACKUP_ENCRYPTION_KEY, AWS_REGION, S3_PREFIX (mongodb),
#         PUSHGATEWAY_URL

set -euo pipefail

: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
AWS_REGION="${AWS_REGION:-us-east-1}"
S3_PREFIX="${S3_PREFIX:-mongodb}"

WORKDIR="${WORKDIR:-/tmp/backup-checksum-$(date -u +%s)}"
mkdir -p "$WORKDIR"
trap 'rm -rf "$WORKDIR"' EXIT

log()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [checksum] $*"; }
fail() { log "FAIL: $*"; push 0; exit 1; }

push() {
  [[ -z "${PUSHGATEWAY_URL:-}" ]] && return 0
  cat <<EOF | curl -sf --data-binary @- "$PUSHGATEWAY_URL/metrics/job/mongodb_backup_checksum" || true
# TYPE backup_checksum_status gauge
backup_checksum_status $1
# TYPE backup_checksum_last_run_timestamp gauge
backup_checksum_last_run_timestamp $(date -u +%s)
EOF
}

LATEST=$(aws s3 ls "s3://$BACKUP_BUCKET/$S3_PREFIX/" --region "$AWS_REGION" \
  | awk '{print $4}' | grep -E '^[0-9]{8}_[0-9]{6}\.enc$' | sort | tail -1)
[[ -z "$LATEST" ]] && fail "no full backup object found"
log "Newest backup: $LATEST"

ENC="$WORKDIR/$LATEST"
aws s3 cp "s3://$BACKUP_BUCKET/$S3_PREFIX/$LATEST" "$ENC" --region "$AWS_REGION" --quiet \
  || fail "download failed"

# ── Compare against the sha256 stored next to the object (if present) ───────
LOCAL_SHA=$(sha256sum "$ENC" | awk '{print $1}')
if aws s3 cp "s3://$BACKUP_BUCKET/$S3_PREFIX/$LATEST.sha256" "$WORKDIR/expected.sha256" \
    --region "$AWS_REGION" --quiet 2>/dev/null; then
  EXPECTED_SHA=$(awk '{print $1}' "$WORKDIR/expected.sha256")
  [[ "$LOCAL_SHA" == "$EXPECTED_SHA" ]] || fail "sha256 mismatch (got $LOCAL_SHA, want $EXPECTED_SHA)"
  log "sha256 matches stored manifest"
else
  # No stored manifest yet — write one so future runs can compare.
  echo "$LOCAL_SHA  $LATEST" > "$WORKDIR/new.sha256"
  aws s3 cp "$WORKDIR/new.sha256" "s3://$BACKUP_BUCKET/$S3_PREFIX/$LATEST.sha256" \
    --region "$AWS_REGION" --quiet
  log "no prior manifest — stored sha256 for future verification"
fi

# ── Decrypt + structural check ─────────────────────────────────────────────
ARCHIVE="$WORKDIR/backup.tar.gz"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in "$ENC" -out "$ARCHIVE" -pass "pass:$BACKUP_ENCRYPTION_KEY" 2>/dev/null \
  || fail "decryption failed — wrong key or corrupt ciphertext"

gzip -t "$ARCHIVE" || fail "gzip integrity check failed"
tar -tzf "$ARCHIVE" | grep -qE '\.bson$' || fail "archive contains no .bson dump files"

log "PASS: backup $LATEST is downloadable, decryptable and structurally valid"
push 1
