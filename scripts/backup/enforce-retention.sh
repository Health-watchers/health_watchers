#!/bin/bash
# scripts/backup/enforce-retention.sh
# Grandfather-father-son (GFS) retention for MongoDB full backups (#1262).
#
# Keeps:
#   - the last DAILY_KEEP daily backups          (default 7)
#   - one backup per ISO week for WEEKLY_KEEP weeks   (default 4)
#   - one backup per calendar month for MONTHLY_KEEP months (default 12)
#
# Backups outside every retention class are deleted. Objects older than
# GLACIER_AFTER_DAYS that are still retained are transitioned to a colder
# storage class instead of being deleted.
#
# Usage:  ./scripts/backup/enforce-retention.sh [--dry-run]
# Env:    BACKUP_BUCKET, AWS_REGION, S3_PREFIX (mongodb),
#         DAILY_KEEP, WEEKLY_KEEP, MONTHLY_KEEP, GLACIER_AFTER_DAYS (30),
#         GLACIER_STORAGE_CLASS (GLACIER_IR)

set -euo pipefail

: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
AWS_REGION="${AWS_REGION:-us-east-1}"
S3_PREFIX="${S3_PREFIX:-mongodb}"
DAILY_KEEP="${DAILY_KEEP:-7}"
WEEKLY_KEEP="${WEEKLY_KEEP:-4}"
MONTHLY_KEEP="${MONTHLY_KEEP:-12}"
GLACIER_AFTER_DAYS="${GLACIER_AFTER_DAYS:-30}"
GLACIER_STORAGE_CLASS="${GLACIER_STORAGE_CLASS:-GLACIER_IR}"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [retention] $*"; }
run() { if $DRY_RUN; then echo "DRY-RUN: $*"; else eval "$*"; fi; }

# Epoch (day granularity) helpers — GNU date with a BSD/macOS fallback.
to_epoch() { date -u -d "$1" +%s 2>/dev/null || date -u -j -f "%Y-%m-%d" "$1" +%s; }
NOW_EPOCH=$(date -u +%s)

# ── List every full backup: "YYYYMMDD_HHMMSS.enc" keys ──────────────────────
mapfile -t KEYS < <(aws s3 ls "s3://$BACKUP_BUCKET/$S3_PREFIX/" --region "$AWS_REGION" \
  | awk '{print $4}' | grep -E '^[0-9]{8}_[0-9]{6}\.enc$' | sort)

if [[ ${#KEYS[@]} -eq 0 ]]; then
  log "No full backups found under s3://$BACKUP_BUCKET/$S3_PREFIX/ — nothing to do."
  exit 0
fi
log "Evaluating ${#KEYS[@]} full backup object(s)."

declare -A KEEP           # key -> reason
declare -A SEEN_WEEK SEEN_MONTH

# Newest first so "one per week/month" keeps the most recent in each bucket.
for (( idx=${#KEYS[@]}-1 ; idx>=0 ; idx-- )); do
  key="${KEYS[$idx]}"
  ymd="${key:0:4}-${key:4:2}-${key:6:2}"
  epoch=$(to_epoch "$ymd")
  age_days=$(( (NOW_EPOCH - epoch) / 86400 ))
  week_id=$(date -u -d "$ymd" +%G-W%V 2>/dev/null || date -u -j -f "%Y-%m-%d" "$ymd" +%G-W%V)
  month_id="${key:0:6}"

  if (( age_days < DAILY_KEEP )); then
    KEEP[$key]="daily"
  elif (( ${#SEEN_WEEK[@]} < WEEKLY_KEEP )) && [[ -z "${SEEN_WEEK[$week_id]:-}" ]]; then
    SEEN_WEEK[$week_id]=1; KEEP[$key]="weekly:$week_id"
  elif (( ${#SEEN_MONTH[@]} < MONTHLY_KEEP )) && [[ -z "${SEEN_MONTH[$month_id]:-}" ]]; then
    SEEN_MONTH[$month_id]=1; KEEP[$key]="monthly:$month_id"
  fi
done

# ── Apply ──────────────────────────────────────────────────────────────────
KEPT=0 DELETED=0 TIERED=0
for key in "${KEYS[@]}"; do
  full="s3://$BACKUP_BUCKET/$S3_PREFIX/$key"
  ymd="${key:0:4}-${key:4:2}-${key:6:2}"
  age_days=$(( (NOW_EPOCH - $(to_epoch "$ymd")) / 86400 ))
  if [[ -n "${KEEP[$key]:-}" ]]; then
    KEPT=$((KEPT+1))
    if (( age_days >= GLACIER_AFTER_DAYS )); then
      log "tier  $key (${KEEP[$key]}, ${age_days}d) -> $GLACIER_STORAGE_CLASS"
      run "aws s3 cp '$full' '$full' --region '$AWS_REGION' \
            --storage-class '$GLACIER_STORAGE_CLASS' --metadata-directive COPY >/dev/null"
      TIERED=$((TIERED+1))
    fi
  else
    log "prune $key (${age_days}d, no retention class)"
    run "aws s3 rm '$full' --region '$AWS_REGION' >/dev/null"
    DELETED=$((DELETED+1))
  fi
done

log "Retention complete: kept=$KEPT tiered=$TIERED deleted=$DELETED (dry-run=$DRY_RUN)"

if [[ -n "${PUSHGATEWAY_URL:-}" ]] && ! $DRY_RUN; then
  cat <<EOF | curl -sf --data-binary @- "$PUSHGATEWAY_URL/metrics/job/mongodb_backup_retention" || true
# TYPE backup_retention_kept gauge
backup_retention_kept $KEPT
# TYPE backup_retention_deleted gauge
backup_retention_deleted $DELETED
# TYPE backup_retention_last_run_timestamp gauge
backup_retention_last_run_timestamp $(date -u +%s)
EOF
fi
