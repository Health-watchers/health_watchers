#!/bin/bash
# scripts/dr/dr-drill.sh
# Orchestrate a disaster-recovery drill and produce a scorecard (objective vs
# actual for every RTO / RPO / integrity check).
#
# Modes:
#   --scope monthly    restore + RTO + integrity in an isolated namespace (default)
#   --scope quarterly   monthly + simulated region failover + secrets recovery
#
# Usage:
#   dr-drill.sh --scope monthly --namespace health-watchers-dr
#
# Env: MONGO_URI (throwaway restore target), BACKUP_BUCKET, BACKUP_ENCRYPTION_KEY,
#      AWS_REGION, DR_BACKUP_BUCKET, SLACK_WEBHOOK_URL

set -euo pipefail

SCOPE="monthly"
NAMESPACE="${NAMESPACE:-health-watchers-dr}"
DRILL_ID="drill-$(date -u +%Y%m%dT%H%M%SZ)"
WORKDIR="${WORKDIR:-/tmp/$DRILL_ID}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
DRILL_LOG="$ROOT/docs/DR_DRILL_LOG.md"
mkdir -p "$WORKDIR"

log()     { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$WORKDIR/drill.log"; }
section() { echo; log "── $* ──"; }

declare -A RESULT   # step -> PASS/FAIL
declare -A ACTUAL   # step -> measured
declare -A TARGET   # step -> objective

record() { RESULT[$1]="$2"; ACTUAL[$1]="${3:-}"; TARGET[$1]="${4:-}"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)     SCOPE="$2"; shift 2 ;;
    --namespace) NAMESPACE="$2"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

log "=== DR DRILL $DRILL_ID (scope: $SCOPE) ==="

# ── Step 1: backup verification ────────────────────────────────────────────
section "Step 1 — backup verification"
if bash "$ROOT/scripts/verify-backup.sh" 2>&1 | tee "$WORKDIR/verify-backup.log"; then
  record verify_backup PASS
else
  record verify_backup FAIL
fi

# ── Step 2: RTO test (mongodb restore) ─────────────────────────────────────
section "Step 2 — RTO test: mongodb restore"
if REPORT="$WORKDIR/rto-mongodb.json" METRICS_FILE="$WORKDIR/rto.prom" \
   bash "$ROOT/scripts/dr/rto-test.sh" --component mongodb --target-seconds 1800; then
  m=$(jq -r '.measured_seconds' "$WORKDIR/rto-mongodb.json")
  record rto_mongodb PASS "$m" 1800
else
  m=$(jq -r '.measured_seconds // "n/a"' "$WORKDIR/rto-mongodb.json" 2>/dev/null || echo n/a)
  record rto_mongodb FAIL "$m" 1800
fi

# ── Step 3: data integrity of the restored set ────────────────────────────
section "Step 3 — data integrity of restored dataset"
if REPORT="$WORKDIR/integrity.json" METRICS_FILE="$WORKDIR/integrity.prom" \
   bash "$ROOT/scripts/dr/verify-data-integrity.sh" --uri "${MONGO_URI:?}"; then
  record data_integrity PASS "$(jq -r '.failures' "$WORKDIR/integrity.json")" 0
else
  record data_integrity FAIL "$(jq -r '.failures // "n/a"' "$WORKDIR/integrity.json" 2>/dev/null || echo n/a)" 0
fi

# ── Step 4: RPO snapshot ──────────────────────────────────────────────────
section "Step 4 — RPO snapshot"
if METRICS_FILE="$WORKDIR/rpo.prom" bash "$ROOT/scripts/dr/rpo-monitor.sh" --rpo-seconds 300; then
  record rpo PASS "$(grep -m1 'source="oplog",region="primary"' "$WORKDIR/rpo.prom" | awk '{print $2}')" 300
else
  record rpo FAIL "breach" 300
fi

# ── Step 5 (quarterly): simulated failover + secrets recovery ─────────────
if [[ "$SCOPE" == "quarterly" ]]; then
  section "Step 5 — simulated region failover (dry-run)"
  if bash "$ROOT/scripts/dr/failover.sh" --to dr --dry-run --reason "$DRILL_ID quarterly drill"; then
    record failover_sim PASS
  else
    record failover_sim FAIL
  fi

  section "Step 6 — secrets DR backup + recovery rehearsal"
  if bash "$ROOT/scripts/secrets/secrets-dr-backup.sh" --env production --store aws 2>&1 \
       | tee "$WORKDIR/secrets-dr.log"; then
    record secrets_dr PASS
  else
    record secrets_dr FAIL
  fi
fi

# ── Scorecard ─────────────────────────────────────────────────────────────
section "SCORECARD"
SCORECARD="$WORKDIR/scorecard.md"
{
  echo "### DR Drill $DRILL_ID — $SCOPE"
  echo
  echo "| Step | Result | Actual | Target |"
  echo "|------|--------|--------|--------|"
  for k in verify_backup rto_mongodb data_integrity rpo failover_sim secrets_dr; do
    [[ -n "${RESULT[$k]:-}" ]] || continue
    icon=$([ "${RESULT[$k]}" = PASS ] && echo "✅" || echo "❌")
    echo "| $k | $icon ${RESULT[$k]} | ${ACTUAL[$k]:-–} | ${TARGET[$k]:-–} |"
  done
  echo
  FAILS=0
  for k in "${!RESULT[@]}"; do [[ "${RESULT[$k]}" == FAIL ]] && FAILS=$((FAILS+1)); done
  echo "**Outcome:** $([ $FAILS -eq 0 ] && echo "PASS — all objectives met" || echo "FAIL — $FAILS step(s) missed objective")"
  echo
  echo "_Artifacts: \`$WORKDIR\`_"
} | tee "$SCORECARD"

# ── Append to the drill log ──────────────────────────────────────────────
if [[ -f "$DRILL_LOG" ]]; then
  { echo; cat "$SCORECARD"; } >> "$DRILL_LOG"
else
  { echo "# DR Drill Log"; echo; cat "$SCORECARD"; } > "$DRILL_LOG"
fi
log "scorecard appended to $DRILL_LOG"

# ── Notify ──────────────────────────────────────────────────────────────
if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
  summary="$(sed 's/"/\\"/g' "$SCORECARD" | head -20 | paste -sd '\n' -)"
  curl -sf -X POST "$SLACK_WEBHOOK_URL" -H 'Content-Type: application/json' \
    -d "{\"text\":\"🧪 DR drill $DRILL_ID complete\n\`\`\`$summary\`\`\`\"}" >/dev/null || true
fi

FAILS=0
for k in "${!RESULT[@]}"; do [[ "${RESULT[$k]}" == FAIL ]] && FAILS=$((FAILS+1)); done
exit $([ $FAILS -eq 0 ] && echo 0 || echo 1)
