#!/bin/bash
# scripts/cost/analyze-utilization.sh
# Resource utilization analysis for Kubernetes workloads/nodes and (optionally)
# EC2/RDS. Reports p50/p95 usage vs requests, flags anything below the target,
# and emits Prometheus metrics + JSON.
#
# Usage:
#   analyze-utilization.sh [--namespace health-watchers] [--window 14d] \
#       [--target 0.80] [--prometheus http://prometheus:9090] [--aws] [--json out.json]
#
# Requires: kubectl; curl + jq for --prometheus; aws-cli for --aws.

set -euo pipefail

NAMESPACE="${NAMESPACE:-health-watchers}"
WINDOW="${WINDOW:-14d}"
TARGET="${TARGET:-0.80}"
PROM="${PROM:-${PROMETHEUS_URL:-}}"
DO_AWS=false
JSON_OUT="${JSON_OUT:-/tmp/cost-utilization.json}"
METRICS_FILE="${METRICS_FILE:-/tmp/cost_utilization_metrics.txt}"

log()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
warn() { echo "  ⚠️  $*"; }
ok()   { echo "  ✅ $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --namespace)  NAMESPACE="$2"; shift 2 ;;
    --window)     WINDOW="$2"; shift 2 ;;
    --target)     TARGET="$2"; shift 2 ;;
    --prometheus) PROM="$2"; shift 2 ;;
    --aws)        DO_AWS=true; shift ;;
    --json)       JSON_OUT="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

promq() {
  curl -sf --data-urlencode "query=$1" "$PROM/api/v1/query" \
    | jq -r '.data.result[0].value[1] // "NaN"'
}

echo "[]" > "$JSON_OUT"
: > "$METRICS_FILE"
{
  echo "# HELP hw_cost_utilization_ratio Observed p95 usage / requested for a scope"
  echo "# TYPE hw_cost_utilization_ratio gauge"
} >> "$METRICS_FILE"

add_json() {  # scope kind cpu_ratio mem_ratio note
  tmp=$(mktemp)
  jq --arg s "$1" --arg k "$2" --arg c "$3" --arg m "$4" --arg n "$5" \
    '. += [{scope:$s, kind:$k, cpu_ratio:($c|tonumber? // null), mem_ratio:($m|tonumber? // null), note:$n}]' \
    "$JSON_OUT" > "$tmp" && mv "$tmp" "$JSON_OUT"
}

# ── Workloads ──────────────────────────────────────────────────────────────
log "Workload utilization in ns=$NAMESPACE (window $WINDOW, target ${TARGET})"
DEPLOYS=$(kubectl -n "$NAMESPACE" get deploy -o jsonpath='{.items[*].metadata.name}')
for d in $DEPLOYS; do
  req_cpu=$(kubectl -n "$NAMESPACE" get deploy "$d" -o jsonpath='{.spec.template.spec.containers[0].resources.requests.cpu}' 2>/dev/null || echo "")
  req_mem=$(kubectl -n "$NAMESPACE" get deploy "$d" -o jsonpath='{.spec.template.spec.containers[0].resources.requests.memory}' 2>/dev/null || echo "")

  if [[ -n "$PROM" ]]; then
    cpu_p95=$(promq "quantile_over_time(0.95, sum(rate(container_cpu_usage_seconds_total{namespace=\"$NAMESPACE\",pod=~\"$d-.*\",container!=\"\"}[5m]))[$WINDOW:5m])")
    cpu_req=$(promq "sum(kube_pod_container_resource_requests{namespace=\"$NAMESPACE\",pod=~\"$d-.*\",resource=\"cpu\"})")
    mem_p95=$(promq "quantile_over_time(0.95, sum(container_memory_working_set_bytes{namespace=\"$NAMESPACE\",pod=~\"$d-.*\",container!=\"\"})[$WINDOW:5m])")
    mem_req=$(promq "sum(kube_pod_container_resource_requests{namespace=\"$NAMESPACE\",pod=~\"$d-.*\",resource=\"memory\"})")
    cpu_ratio=$(awk -v u="$cpu_p95" -v r="$cpu_req" 'BEGIN{ if (r+0>0) printf "%.2f", u/r; else print "NaN" }')
    mem_ratio=$(awk -v u="$mem_p95" -v r="$mem_req" 'BEGIN{ if (r+0>0) printf "%.2f", u/r; else print "NaN" }')
  else
    # fall back to a point-in-time kubectl top sample
    read -r _ tcpu tmem _ < <(kubectl -n "$NAMESPACE" top pod -l app="$d" --no-headers 2>/dev/null | head -1 || echo "x 0m 0Mi x")
    cpu_ratio="NaN"; mem_ratio="NaN"
    log "  (no Prometheus; kubectl top sample for $d: cpu=$tcpu mem=$tmem)"
  fi

  printf '  %-32s cpu %s/%s  ratio=%s   mem %s/%s  ratio=%s\n' \
    "$d" "${cpu_p95:-?}" "${req_cpu:-?}" "$cpu_ratio" "${mem_p95:-?}" "${req_mem:-?}" "$mem_ratio"

  for pair in "cpu:$cpu_ratio" "memory:$mem_ratio"; do
    res="${pair%%:*}"; val="${pair##*:}"
    [[ "$val" == "NaN" ]] && continue
    echo "hw_cost_utilization_ratio{scope=\"deploy/$d\",namespace=\"$NAMESPACE\",resource=\"$res\"} $val" >> "$METRICS_FILE"
    if awk -v v="$val" -v t="$TARGET" 'BEGIN{exit !(v < t)}'; then
      warn "$d $res at $val (< target $TARGET) — right-sizing candidate"
    fi
  done
  add_json "deploy/$d" workload "$cpu_ratio" "$mem_ratio" ""
done

# ── Nodes ──────────────────────────────────────────────────────────────────
log "Node pool utilization"
if kubectl top node --no-headers >/tmp/nodes.$$ 2>/dev/null; then
  total_cpu_pct=0; total_mem_pct=0; n=0
  while read -r name cpu cpupct mem mempct; do
    n=$((n+1))
    total_cpu_pct=$((total_cpu_pct + ${cpupct%\%}))
    total_mem_pct=$((total_mem_pct + ${mempct%\%}))
  done < /tmp/nodes.$$
  rm -f /tmp/nodes.$$
  if (( n > 0 )); then
    avg_cpu=$(awk -v s="$total_cpu_pct" -v n="$n" 'BEGIN{printf "%.2f", s/n/100}')
    avg_mem=$(awk -v s="$total_mem_pct" -v n="$n" 'BEGIN{printf "%.2f", s/n/100}')
    echo "hw_cost_utilization_ratio{scope=\"nodes\",resource=\"cpu\"} $avg_cpu" >> "$METRICS_FILE"
    echo "hw_cost_utilization_ratio{scope=\"nodes\",resource=\"memory\"} $avg_mem" >> "$METRICS_FILE"
    printf '  %d nodes: avg cpu %s  avg mem %s\n' "$n" "$avg_cpu" "$avg_mem"
    awk -v v="$avg_cpu" -v t="$TARGET" 'BEGIN{exit !(v < t)}' && warn "node CPU $avg_cpu < target — scale in / bin-pack" || ok "node CPU within target"
    add_json "nodes" node "$avg_cpu" "$avg_mem" "$n nodes"
  fi
else
  warn "metrics-server not available — skipping node analysis"
fi

# ── EC2 / RDS ──────────────────────────────────────────────────────────────
if $DO_AWS; then
  log "EC2 instance CPU p95 over 14d"
  start=$(date -u -d '-14 days' +%Y-%m-%dT%H:%M:%SZ); end=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  aws ec2 describe-instances --filters Name=instance-state-name,Values=running \
    --query 'Reservations[].Instances[].[InstanceId,InstanceType]' --output text | while read -r id type; do
    p95=$(aws cloudwatch get-metric-statistics --namespace AWS/EC2 --metric-name CPUUtilization \
      --dimensions Name=InstanceId,Value="$id" --start-time "$start" --end-time "$end" \
      --period 3600 --statistics Maximum --query 'sort_by(Datapoints,&Maximum)[-2].Maximum' --output text 2>/dev/null || echo 0)
    printf '  %-20s %-14s cpu_p95=%.0f%%\n' "$id" "$type" "${p95:-0}"
    ratio=$(awk -v v="${p95:-0}" 'BEGIN{printf "%.2f", v/100}')
    echo "hw_cost_utilization_ratio{scope=\"ec2/$id\",instance_type=\"$type\",resource=\"cpu\"} $ratio" >> "$METRICS_FILE"
    awk -v v="$ratio" -v t="$TARGET" 'BEGIN{exit !(v < t)}' && warn "$id ($type) underutilized — downsize candidate" || true
  done
fi

echo
log "metrics → $METRICS_FILE ; details → $JSON_OUT"
log "done. Feed $JSON_OUT into scripts/cost/rightsizing-recommendations.sh"
