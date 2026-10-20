#!/bin/bash
# scripts/dr/rto-test.sh
# Measure Recovery Time Objective for a component and compare with the target.
#
# Times each recovery phase individually so regressions are attributable, writes
# Prometheus textfile metrics and a JSON report, and exits non-zero when the
# measured RTO exceeds the target.
#
# Usage:
#   rto-test.sh --component <mongodb|api|web|stellar> --target-seconds <n> \
#               [--namespace <ns>] [--backup-bucket <b>] [--report <path>]
#
# Env: MONGO_URI (target for restore), BACKUP_BUCKET, BACKUP_ENCRYPTION_KEY,
#      AWS_REGION, KUBECONFIG

set -euo pipefail

COMPONENT=""
TARGET=0
NAMESPACE="${NAMESPACE:-health-watchers-dr}"
BACKUP_BUCKET="${BACKUP_BUCKET:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"
REPORT="${REPORT:-/tmp/dr-rto-report.json}"
METRICS_FILE="${METRICS_FILE:-/tmp/dr_rto_metrics.txt}"
S3_PREFIX="${S3_PREFIX:-mongodb}"

log()     { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
error()   { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ❌ ERROR: $*" >&2; }
success() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✅ $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --component)      COMPONENT="$2"; shift 2 ;;
    --target-seconds) TARGET="$2"; shift 2 ;;
    --namespace)      NAMESPACE="$2"; shift 2 ;;
    --backup-bucket)  BACKUP_BUCKET="$2"; shift 2 ;;
    --report)         REPORT="$2"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) error "unknown arg: $1"; exit 1 ;;
  esac
done
[[ -n "$COMPONENT" && "$TARGET" -gt 0 ]] || { error "--component and --target-seconds are required"; exit 1; }

declare -A PHASE
phase() {
  local name="$1"; shift
  local start end
  start=$(date +%s.%N)
  log "▶ $name"
  "$@"
  end=$(date +%s.%N)
  PHASE[$name]=$(echo "$end - $start" | bc)
  log "  ↳ ${PHASE[$name]}s"
}

# ── component recovery definitions ──────────────────────────────────────────
recover_mongodb() {
  : "${MONGO_URI:?}" "${BACKUP_ENCRYPTION_KEY:?}" "${BACKUP_BUCKET:?}"
  local work; work="$(mktemp -d)"; trap 'rm -rf "$work"' RETURN

  phase fetch_backup bash -c "
    latest=\$(aws s3 ls s3://$BACKUP_BUCKET/$S3_PREFIX/ --region $AWS_REGION --recursive | sort | tail -1 | awk '{print \$4}')
    [ -n \"\$latest\" ] || { echo 'no backup found'; exit 1; }
    aws s3 cp s3://$BACKUP_BUCKET/\$latest $work/backup.enc --region $AWS_REGION
  "
  phase decrypt openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -in "$work/backup.enc" -out "$work/backup.archive" -pass "pass:$BACKUP_ENCRYPTION_KEY"
  phase restore mongorestore --uri="$MONGO_URI" --drop --gzip \
    --archive="$work/backup.archive" --numParallelCollections=4
  phase build_indexes mongosh "$MONGO_URI" --quiet --eval 'db.getSiblingDB("health_watchers").runCommand({ping:1})'
  phase readiness bash -c "
    for i in \$(seq 1 60); do
      mongosh '$MONGO_URI' --quiet --eval 'db.runCommand({ping:1}).ok' | grep -q 1 && exit 0
      sleep 2
    done
    exit 1
  "
}

recover_k8s_service() {
  local deploy="health-watchers-$1"
  phase apply_manifests kubectl -n "$NAMESPACE" rollout restart "deploy/$deploy"
  phase wait_ready kubectl -n "$NAMESPACE" rollout status "deploy/$deploy" --timeout=600s
  phase health_probe bash -c "
    url=\$(kubectl -n $NAMESPACE get svc $deploy -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null)
    [ -n \"\$url\" ] || url=$deploy.$NAMESPACE.svc.cluster.local
    for i in \$(seq 1 60); do
      code=\$(curl -s -o /dev/null -w '%{http_code}' http://\$url/health || true)
      [ \"\$code\" = 200 ] && exit 0
      sleep 3
    done
    exit 1
  "
}

OVERALL_START=$(date +%s.%N)
case "$COMPONENT" in
  mongodb) recover_mongodb ;;
  api|web|stellar) recover_k8s_service "$COMPONENT" ;;
  *) error "unsupported component: $COMPONENT"; exit 1 ;;
esac
OVERALL_END=$(date +%s.%N)
MEASURED=$(printf '%.0f' "$(echo "$OVERALL_END - $OVERALL_START" | bc)")

# ── report ─────────────────────────────────────────────────────────────────
{
  echo "{"
  echo "  \"component\": \"$COMPONENT\","
  echo "  \"measured_seconds\": $MEASURED,"
  echo "  \"target_seconds\": $TARGET,"
  echo "  \"met\": $([ "$MEASURED" -le "$TARGET" ] && echo true || echo false),"
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"phases\": {"
  n=0; total=${#PHASE[@]}
  for k in "${!PHASE[@]}"; do
    n=$((n+1)); comma=$([ $n -lt $total ] && echo , || echo "")
    printf '    "%s": %s%s\n' "$k" "${PHASE[$k]}" "$comma"
  done
  echo "  }"
  echo "}"
} | tee "$REPORT"

{
  echo "# HELP dr_rto_seconds Measured recovery time for a component"
  echo "# TYPE dr_rto_seconds gauge"
  echo "dr_rto_seconds{component=\"$COMPONENT\"} $MEASURED"
  echo "# HELP dr_rto_target_seconds Target recovery time for a component"
  echo "# TYPE dr_rto_target_seconds gauge"
  echo "dr_rto_target_seconds{component=\"$COMPONENT\"} $TARGET"
  echo "dr_rto_test_timestamp_seconds{component=\"$COMPONENT\"} $(date +%s)"
} > "$METRICS_FILE"

echo
if [[ "$MEASURED" -le "$TARGET" ]]; then
  success "RTO for $COMPONENT: ${MEASURED}s ≤ target ${TARGET}s"
else
  error "RTO for $COMPONENT: ${MEASURED}s EXCEEDS target ${TARGET}s"
  exit 1
fi
