#!/bin/bash
# scripts/cost/cost-report.sh
# Pull AWS Cost Explorer data, compare with the baseline and the 20% target,
# show the biggest movers, and emit Prometheus metrics + a Markdown report.
#
# Usage:
#   cost-report.sh [--months 3] [--granularity MONTHLY] [--baseline ops/cost/baseline.json] \
#       [--set-baseline] [--md out.md] [--budget ops/cost/budgets.json]
#
# Requires: aws-cli (ce:GetCostAndUsage), jq.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
MONTHS=3
GRAN="MONTHLY"
BASELINE="${BASELINE:-$ROOT/ops/cost/baseline.json}"
BUDGETS="${BUDGETS:-$ROOT/ops/cost/budgets.json}"
SET_BASELINE=false
MD_OUT="${MD_OUT:-/tmp/cost-report.md}"
METRICS_FILE="${METRICS_FILE:-/tmp/cost_report_metrics.txt}"
TARGET_REDUCTION="0.20"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --months)       MONTHS="$2"; shift 2 ;;
    --granularity)  GRAN="$2"; shift 2 ;;
    --baseline)     BASELINE="$2"; shift 2 ;;
    --set-baseline) SET_BASELINE=true; shift ;;
    --md)           MD_OUT="$2"; shift 2 ;;
    --budget)       BUDGETS="$2"; shift 2 ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

START=$(date -u -d "-${MONTHS} months" +%Y-%m-01)
END=$(date -u +%Y-%m-01)
MTD_START=$(date -u +%Y-%m-01)
MTD_END=$(date -u +%Y-%m-%d)

log "Cost Explorer $START → $END ($GRAN), grouped by SERVICE and tag:env"

CE_JSON=$(aws ce get-cost-and-usage \
  --time-period "Start=$START,End=$END" \
  --granularity "$GRAN" \
  --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --group-by Type=TAG,Key=env 2>/dev/null || echo '{}')

MTD_JSON=$(aws ce get-cost-and-usage \
  --time-period "Start=$MTD_START,End=$MTD_END" \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=TAG,Key=env 2>/dev/null || echo '{}')

# latest full month total
LATEST_TOTAL=$(jq -r '
  (.ResultsByTime // []) | last | (.Groups // []) |
  map(.Metrics.UnblendedCost.Amount | tonumber) | add // 0' <<<"$CE_JSON")
PREV_TOTAL=$(jq -r '
  (.ResultsByTime // []) | if length>=2 then .[length-2] else .[0] end | (.Groups // []) |
  map(.Metrics.UnblendedCost.Amount | tonumber) | add // 0' <<<"$CE_JSON")
MTD_TOTAL=$(jq -r '[(.ResultsByTime // [])[].Groups[]?.Metrics.UnblendedCost.Amount | tonumber] | add // 0' <<<"$MTD_JSON")

if $SET_BASELINE; then
  mkdir -p "$(dirname "$BASELINE")"
  jq -n --arg total "$LATEST_TOTAL" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson services "$(jq '[(.ResultsByTime // []) | last | .Groups[]? | {(.Keys[0]): (.Metrics.UnblendedCost.Amount|tonumber)}] | add // {}' <<<"$CE_JSON")" \
    '{recorded_at:$at, monthly_total_usd:($total|tonumber), by_service:$services}' > "$BASELINE"
  log "baseline written → $BASELINE (monthly_total_usd=$LATEST_TOTAL)"
fi

BASE_TOTAL=$(jq -r '.monthly_total_usd // 0' "$BASELINE" 2>/dev/null || echo 0)
TARGET_TOTAL=$(awk -v b="$BASE_TOTAL" -v r="$TARGET_REDUCTION" 'BEGIN{printf "%.2f", b*(1-r)}')
REDUCTION_PCT=$(awk -v b="$BASE_TOTAL" -v c="$LATEST_TOTAL" 'BEGIN{ if(b>0) printf "%.1f", (b-c)/b*100; else print "0.0" }')
MOM_PCT=$(awk -v p="$PREV_TOTAL" -v c="$LATEST_TOTAL" 'BEGIN{ if(p>0) printf "%+.1f", (c-p)/p*100; else print "n/a" }')

# ── Markdown report ──────────────────────────────────────────────────────
{
  echo "## Cloud cost report — $(date -u +%Y-%m-%d)"
  echo
  echo "| Metric | Value |"
  echo "|--------|-------|"
  echo "| Latest full month | \$$(printf '%.2f' "$LATEST_TOTAL") |"
  echo "| Previous month | \$$(printf '%.2f' "$PREV_TOTAL") (MoM ${MOM_PCT}%) |"
  echo "| Month-to-date | \$$(printf '%.2f' "$MTD_TOTAL") |"
  echo "| Baseline | \$$(printf '%.2f' "$BASE_TOTAL") |"
  echo "| Reduction vs baseline | **${REDUCTION_PCT}%** (target 20%) |"
  echo "| Target monthly total | \$$(printf '%.2f' "$TARGET_TOTAL") |"
  echo
  echo "### Top services (latest full month)"
  echo
  echo "| Service | \$ | vs baseline |"
  echo "|---------|----|-------------|"
  jq -r --slurpfile base "$BASELINE" '
    (.ResultsByTime // []) | last | .Groups
    | map({svc: .Keys[0], amt: (.Metrics.UnblendedCost.Amount|tonumber)})
    | sort_by(-.amt) | .[:12][]
    | . as $g
    | ($base[0].by_service[$g.svc] // 0) as $b
    | "| \($g.svc) | \($g.amt|.*100|round/100) | \(if $b>0 then (($g.amt-$b)/$b*100|.*10|round/10|tostring)+"%" else "–" end) |"
  ' <<<"$CE_JSON" 2>/dev/null || echo "| (no data) | | |"
  echo
  echo "### By environment (MTD)"
  echo
  echo "| env | MTD \$ | monthly budget | % of budget |"
  echo "|-----|-------|----------------|-------------|"
  if [[ -f "$BUDGETS" ]]; then
    jq -r '.budgets[] | "\(.name)\t\(.monthly_limit_usd)"' "$BUDGETS" | while IFS=$'\t' read -r envn limit; do
      spent=$(jq -r --arg e "$envn" '[(.ResultsByTime // [])[].Groups[]? | select(.Keys[0]==$e) | .Metrics.UnblendedCost.Amount|tonumber] | add // 0' <<<"$MTD_JSON")
      pct=$(awk -v s="$spent" -v l="$limit" 'BEGIN{ if(l>0) printf "%.0f", s/l*100; else print 0 }')
      echo "| $envn | \$$(printf '%.2f' "$spent") | \$$limit | ${pct}% |"
    done
  else
    echo "| (no ops/cost/budgets.json) | | | |"
  fi
} > "$MD_OUT"

# ── Prometheus metrics ─────────────────────────────────────────────────
{
  echo "# HELP hw_cost_month_latest_usd Cost of the latest full calendar month"
  echo "# TYPE hw_cost_month_latest_usd gauge"
  echo "hw_cost_month_latest_usd $LATEST_TOTAL"
  echo "hw_cost_month_previous_usd $PREV_TOTAL"
  echo "hw_cost_month_to_date_usd $MTD_TOTAL"
  echo "hw_cost_baseline_usd $BASE_TOTAL"
  echo "# HELP hw_cost_reduction_ratio Reduction vs baseline (0.20 = 20% cheaper)"
  echo "# TYPE hw_cost_reduction_ratio gauge"
  echo "hw_cost_reduction_ratio $(awk -v p="$REDUCTION_PCT" 'BEGIN{printf "%.4f", p/100}')"
  echo "hw_cost_target_reduction_ratio $TARGET_REDUCTION"
  echo "hw_cost_report_timestamp_seconds $(date +%s)"
} > "$METRICS_FILE"

log "report → $MD_OUT ; metrics → $METRICS_FILE"
cat "$MD_OUT"

# non-zero if we are moving the wrong way month-over-month by >5%
awk -v m="$MOM_PCT" 'BEGIN{ m=m+0; exit !(m > 5) }' && { log "⚠️  spend up ${MOM_PCT}% MoM"; exit 3; } || exit 0
