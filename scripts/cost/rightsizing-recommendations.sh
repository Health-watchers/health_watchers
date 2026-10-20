#!/bin/bash
# scripts/cost/rightsizing-recommendations.sh
# Turn a utilization report into concrete right-sizing recommendations.
# Does NOT mutate anything — it emits a Markdown block (for a PR description) and
# a CSV (for Finance).
#
# Usage:
#   rightsizing-recommendations.sh --input /tmp/cost-utilization.json \
#       [--headroom 1.2] [--min-cpu 50m] [--min-mem 64Mi] \
#       [--md out.md] [--csv out.csv] [--compute-optimizer]
#
# Requires: jq; aws-cli for --compute-optimizer.

set -euo pipefail

INPUT="${INPUT:-/tmp/cost-utilization.json}"
HEADROOM="${HEADROOM:-1.2}"
MIN_CPU_M=50
MIN_MEM_MI=64
MD_OUT="${MD_OUT:-/tmp/rightsizing.md}"
CSV_OUT="${CSV_OUT:-/tmp/rightsizing.csv}"
USE_CO=false
# rough on-demand blended $/hour references for the delta estimate
USD_PER_VCPU_HR="${USD_PER_VCPU_HR:-0.031}"
USD_PER_GB_HR="${USD_PER_GB_HR:-0.004}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)   INPUT="$2"; shift 2 ;;
    --headroom) HEADROOM="$2"; shift 2 ;;
    --min-cpu) MIN_CPU_M="${2%m}"; shift 2 ;;
    --min-mem) MIN_MEM_MI="${2%Mi}"; shift 2 ;;
    --md)      MD_OUT="$2"; shift 2 ;;
    --csv)     CSV_OUT="$2"; shift 2 ;;
    --compute-optimizer) USE_CO=true; shift ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done
[[ -f "$INPUT" ]] || { echo "input not found: $INPUT (run analyze-utilization.sh --json)"; exit 1; }

# round up to a sane step (m for cpu, Mi for mem)
round_cpu() { awk -v v="$1" 'BEGIN{ s=25; r=(int((v+s-1)/s))*s; if(r<'"$MIN_CPU_M"')r='"$MIN_CPU_M"'; print r }'; }
round_mem() { awk -v v="$1" 'BEGIN{ s=32; r=(int((v+s-1)/s))*s; if(r<'"$MIN_MEM_MI"')r='"$MIN_MEM_MI"'; print r }'; }

echo "scope,resource,current,recommended,monthly_usd_delta" > "$CSV_OUT"
{
  echo "### Right-sizing recommendations"
  echo
  echo "_Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) · headroom ×${HEADROOM} over p95 · advisory only._"
  echo
  echo "| Scope | Resource | Current req | p95 usage ratio | Recommended req | Est. \$/mo delta |"
  echo "|-------|----------|-------------|-----------------|-----------------|-----------------|"
} > "$MD_OUT"

TOTAL_DELTA=0

# We only have ratios in the JSON; pull current requests live from the cluster.
jq -r '.[] | select(.kind=="workload") | [.scope, (.cpu_ratio//"null"), (.mem_ratio//"null")] | @tsv' "$INPUT" \
| while IFS=$'\t' read -r scope cpu_ratio mem_ratio; do
  deploy="${scope#deploy/}"
  ns="${NAMESPACE:-health-watchers}"
  cur_cpu=$(kubectl -n "$ns" get deploy "$deploy" -o jsonpath='{.spec.template.spec.containers[0].resources.requests.cpu}' 2>/dev/null || echo "")
  cur_mem=$(kubectl -n "$ns" get deploy "$deploy" -o jsonpath='{.spec.template.spec.containers[0].resources.requests.memory}' 2>/dev/null || echo "")

  # normalise current to m / Mi
  cur_cpu_m=$(awk -v c="$cur_cpu" 'BEGIN{ if(c ~ /m$/){sub(/m/,"",c); print c} else if(c=="") print 0; else print c*1000 }')
  cur_mem_mi=$(awk -v m="$cur_mem" 'BEGIN{
     if(m ~ /Gi$/){sub(/Gi/,"",m); print m*1024}
     else if(m ~ /Mi$/){sub(/Mi/,"",m); print m}
     else if(m=="") print 0
     else print m/1048576 }')

  [[ "$cpu_ratio" == "null" || -z "$cur_cpu_m" || "$cur_cpu_m" == "0" ]] && continue

  rec_cpu_m=$(round_cpu "$(awk -v c="$cur_cpu_m" -v r="$cpu_ratio" -v h="$HEADROOM" 'BEGIN{print c*r*h}')")
  rec_mem_mi=$(round_mem "$(awk -v c="$cur_mem_mi" -v r="${mem_ratio/null/1}" -v h="$HEADROOM" 'BEGIN{print c*r*h}')")

  # skip if within 10% of current (not worth a change)
  close=$(awk -v a="$cur_cpu_m" -v b="$rec_cpu_m" 'BEGIN{d=(a>b?a-b:b-a); print (a>0 && d/a < 0.10)?1:0}')
  [[ "$close" == "1" ]] && continue

  replicas=$(kubectl -n "$ns" get deploy "$deploy" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo 1)
  d_cpu=$(awk -v a="$cur_cpu_m" -v b="$rec_cpu_m" -v n="$replicas" -v p="$USD_PER_VCPU_HR" 'BEGIN{printf "%.2f", (a-b)/1000*n*p*730}')
  d_mem=$(awk -v a="$cur_mem_mi" -v b="$rec_mem_mi" -v n="$replicas" -v p="$USD_PER_GB_HR" 'BEGIN{printf "%.2f", (a-b)/1024*n*p*730}')
  delta=$(awk -v a="$d_cpu" -v b="$d_mem" 'BEGIN{printf "%.2f", a+b}')
  TOTAL_DELTA=$(awk -v t="$TOTAL_DELTA" -v d="$delta" 'BEGIN{printf "%.2f", t+d}')

  printf '| %s | cpu+mem | %s / %s | %s / %s | %sm / %sMi | %s |\n' \
    "$scope" "${cur_cpu:-–}" "${cur_mem:-–}" "$cpu_ratio" "${mem_ratio}" "$rec_cpu_m" "$rec_mem_mi" "\$$delta" >> "$MD_OUT"
  echo "$scope,cpu,${cur_cpu_m}m,${rec_cpu_m}m,$d_cpu" >> "$CSV_OUT"
  echo "$scope,memory,${cur_mem_mi}Mi,${rec_mem_mi}Mi,$d_mem" >> "$CSV_OUT"
done

# Node pools + EC2 from Compute Optimizer
if $USE_CO; then
  {
    echo
    echo "#### AWS Compute Optimizer findings"
    echo
    echo "| Resource | Finding | Recommended | Est. monthly saving |"
    echo "|----------|---------|-------------|---------------------|"
  } >> "$MD_OUT"
  aws compute-optimizer get-ec2-instance-recommendations \
    --query 'instanceRecommendations[?finding!=`Optimized`].[instanceArn,finding,recommendationOptions[0].instanceType,recommendationOptions[0].estimatedMonthlySavings.value]' \
    --output text 2>/dev/null | while read -r arn finding rec saving; do
    echo "| ${arn##*/} | $finding | $rec | \$${saving:-?} |" >> "$MD_OUT"
    echo "${arn##*/},instance,$finding,$rec,${saving:-0}" >> "$CSV_OUT"
  done || log "Compute Optimizer not enabled / no permission"
fi

{
  echo
  echo "**Estimated total monthly reduction from workload right-sizing: \$$(awk -v t="$TOTAL_DELTA" 'BEGIN{printf "%.2f", t}')**"
  echo
  echo "Apply by editing \`helm/health-watchers/values-*.yaml\` (or the k8s manifests) in a PR; triage in the monthly cost review."
} >> "$MD_OUT"

log "markdown → $MD_OUT"
log "csv      → $CSV_OUT"
cat "$MD_OUT"
