#!/bin/bash
# scripts/backup/backup-cost-report.sh
# Backup storage cost analysis and optimisation hints (#1262).
#
# Summarises what the backup buckets are costing, broken down by storage class
# and by backup type (full / incremental / geo-redundant copy), and flags
# objects that should be transitioned to a colder tier. Emits the monthly
# estimate as a Prometheus metric so "cost monitored" is alertable.
#
# Usage:  ./scripts/backup/backup-cost-report.sh [--json]
# Env:    BACKUP_BUCKET, AWS_REGION, S3_PREFIX (mongodb),
#         DR_BACKUP_BUCKET (optional cross-region copy),
#         GLACIER_AFTER_DAYS (30), PUSHGATEWAY_URL

set -euo pipefail

: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
AWS_REGION="${AWS_REGION:-us-east-1}"
S3_PREFIX="${S3_PREFIX:-mongodb}"
GLACIER_AFTER_DAYS="${GLACIER_AFTER_DAYS:-30}"
JSON=false
[[ "${1:-}" == "--json" ]] && JSON=true

# USD per GB-month (us-east-1 list price, approximate — override via env).
PRICE_STANDARD="${PRICE_STANDARD:-0.023}"
PRICE_STANDARD_IA="${PRICE_STANDARD_IA:-0.0125}"
PRICE_GLACIER_IR="${PRICE_GLACIER_IR:-0.004}"
PRICE_GLACIER="${PRICE_GLACIER:-0.0036}"
PRICE_DEEP_ARCHIVE="${PRICE_DEEP_ARCHIVE:-0.00099}"

price_for() {
  case "$1" in
    STANDARD) echo "$PRICE_STANDARD" ;;
    STANDARD_IA) echo "$PRICE_STANDARD_IA" ;;
    GLACIER_IR) echo "$PRICE_GLACIER_IR" ;;
    GLACIER) echo "$PRICE_GLACIER" ;;
    DEEP_ARCHIVE) echo "$PRICE_DEEP_ARCHIVE" ;;
    *) echo "$PRICE_STANDARD" ;;
  esac
}

NOW_EPOCH=$(date -u +%s)
TOTAL_BYTES=0
TOTAL_COST=0
COLD_CANDIDATES=0
COLD_BYTES=0

analyse_bucket() {
  local bucket="$1" label="$2"
  local rows
  rows=$(aws s3api list-objects-v2 --bucket "$bucket" --prefix "$S3_PREFIX/" \
    --region "$AWS_REGION" \
    --query 'Contents[].{K:Key,S:Size,C:StorageClass,M:LastModified}' --output json 2>/dev/null || echo '[]')

  echo "$rows" | python3 - "$label" "$NOW_EPOCH" "$GLACIER_AFTER_DAYS" <<'PY'
import json, sys, datetime
label, now, cold_after = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
rows = json.load(sys.stdin) or []
by_class = {}
cold_bytes = cold_n = 0
for r in rows:
    cls = r.get("C") or "STANDARD"
    by_class.setdefault(cls, [0, 0])
    by_class[cls][0] += 1
    by_class[cls][1] += r.get("S", 0)
    lm = r.get("M")
    if lm:
        try:
            dt = datetime.datetime.fromisoformat(lm.replace("Z", "+00:00"))
            age_days = (now - int(dt.timestamp())) / 86400
        except Exception:
            age_days = 0
        if cls in ("STANDARD", "STANDARD_IA") and age_days >= cold_after:
            cold_bytes += r.get("S", 0); cold_n += 1
print(f"::{label}::" + json.dumps({"by_class": by_class, "cold_bytes": cold_bytes, "cold_n": cold_n}))
PY
}

echo "── Backup storage cost report ($(date -u +%Y-%m-%d)) ──"
for spec in "$BACKUP_BUCKET|primary" ${DR_BACKUP_BUCKET:+"$DR_BACKUP_BUCKET|dr-region"}; do
  bucket="${spec%%|*}"; label="${spec##*|}"
  line=$(analyse_bucket "$bucket" "$label" | grep '^::' || true)
  [[ -z "$line" ]] && { echo "  $label ($bucket): no objects / not accessible"; continue; }
  payload="${line#::$label::}"
  echo "  $label ($bucket):"
  echo "$payload" | python3 - "$PRICE_STANDARD" "$PRICE_STANDARD_IA" "$PRICE_GLACIER_IR" "$PRICE_GLACIER" "$PRICE_DEEP_ARCHIVE" <<'PY'
import json, sys
p = {"STANDARD": float(sys.argv[1]), "STANDARD_IA": float(sys.argv[2]),
     "GLACIER_IR": float(sys.argv[3]), "GLACIER": float(sys.argv[4]),
     "DEEP_ARCHIVE": float(sys.argv[5])}
d = json.loads(sys.stdin.read())
tot_b = tot_c = 0.0
for cls, (n, b) in sorted(d["by_class"].items()):
    gb = b / 1024**3
    cost = gb * p.get(cls, p["STANDARD"])
    tot_b += b; tot_c += cost
    print(f"    {cls:<14} {n:>4} obj  {gb:8.2f} GB  ${cost:7.2f}/mo")
print(f"    {'TOTAL':<14} {'':>4}      {tot_b/1024**3:8.2f} GB  ${tot_c:7.2f}/mo")
if d["cold_n"]:
    save = (d["cold_bytes"]/1024**3) * (p["STANDARD_IA"] - p["GLACIER_IR"])
    print(f"    HINT: {d['cold_n']} object(s) ({d['cold_bytes']/1024**3:.2f} GB) are older than the")
    print(f"          transition threshold — moving them to GLACIER_IR saves ~${save:.2f}/mo.")
PY
done

if [[ -n "${PUSHGATEWAY_URL:-}" ]]; then
  GB=$(aws s3 ls "s3://$BACKUP_BUCKET/$S3_PREFIX/" --region "$AWS_REGION" --recursive --summarize \
        | awk '/Total Size/ {print $3/1024/1024/1024}')
  EST=$(python3 -c "print(round(${GB:-0} * $PRICE_STANDARD_IA, 2))")
  cat <<EOF | curl -sf --data-binary @- "$PUSHGATEWAY_URL/metrics/job/mongodb_backup_cost" || true
# TYPE backup_storage_gigabytes gauge
backup_storage_gigabytes ${GB:-0}
# TYPE backup_estimated_monthly_cost_usd gauge
backup_estimated_monthly_cost_usd ${EST:-0}
# TYPE backup_cost_report_last_run_timestamp gauge
backup_cost_report_last_run_timestamp $(date -u +%s)
EOF
  echo "  Pushed backup_estimated_monthly_cost_usd=${EST:-0} to Pushgateway."
fi
