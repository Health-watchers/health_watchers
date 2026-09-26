#!/bin/bash
# scripts/cdn/cdn-performance-report.sh
# Pull CDN analytics and produce a performance + cost report:
#   cache hit ratio, bytes served vs origin bytes ($ saved), edge TTFB p50/p95,
#   top cache MISS paths, 4xx/5xx by edge. Emits Prometheus metrics + Markdown.
#
# Usage:
#   cdn-performance-report.sh --provider cloudflare --since 7d [--md out.md]
#   cdn-performance-report.sh --provider cloudfront --since 7d
#
# Env: CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN  |  CLOUDFRONT_DISTRIBUTION_ID, AWS_REGION
#      ORIGIN_USD_PER_GB (default 0.09) for the savings estimate
# Requires: curl, jq; aws-cli for cloudfront.

set -euo pipefail

PROVIDER="${CDN_PROVIDER:-cloudflare}"
SINCE="7d"
MD_OUT="${MD_OUT:-/tmp/cdn-performance-report.md}"
METRICS_FILE="${METRICS_FILE:-/tmp/cdn_performance_metrics.txt}"
ORIGIN_USD_PER_GB="${ORIGIN_USD_PER_GB:-0.09}"
HIT_TARGET="0.95"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider) PROVIDER="$2"; shift 2 ;;
    --since)    SINCE="$2"; shift 2 ;;
    --md)       MD_OUT="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

# normalise --since to an ISO start time
num="${SINCE%[dh]}"; unit="${SINCE: -1}"
case "$unit" in
  d) START=$(date -u -d "-${num} days"  +%Y-%m-%dT%H:%M:%SZ) ;;
  h) START=$(date -u -d "-${num} hours" +%Y-%m-%dT%H:%M:%SZ) ;;
  *) START=$(date -u -d "-7 days" +%Y-%m-%dT%H:%M:%SZ) ;;
esac
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)

HIT_RATIO=0; EDGE_BYTES=0; ORIGIN_BYTES=0; REQ_TOTAL=0; TTFB_P50=0; TTFB_P95=0
ERR_4XX=0; ERR_5XX=0
TOP_MISS="(provider analytics not available)"

# ── Cloudflare (GraphQL Analytics) ───────────────────────────────────────
report_cloudflare() {
  [[ -n "${CLOUDFLARE_ZONE_ID:-}" && -n "${CLOUDFLARE_API_TOKEN:-}" ]] || { log "cloudflare not configured"; return 1; }
  local q
  q=$(cat <<GQL
{"query":"query { viewer { zones(filter:{zoneTag:\\"${CLOUDFLARE_ZONE_ID}\\"}) {
  httpRequests1hGroups(limit:1000, filter:{datetime_geq:\\"${START}\\", datetime_leq:\\"${END}\\"}) {
    sum { requests cachedRequests bytes cachedBytes responseStatusMap { edgeResponseStatus requests } }
  }
} } }"}
GQL
)
  local resp
  resp=$(curl -sf -X POST "https://api.cloudflare.com/client/v4/graphql" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" \
    --data "$(echo "$q" | tr -d '\n')") || return 1

  REQ_TOTAL=$(jq '[.data.viewer.zones[0].httpRequests1hGroups[].sum.requests] | add // 0' <<<"$resp")
  local cached; cached=$(jq '[.data.viewer.zones[0].httpRequests1hGroups[].sum.cachedRequests] | add // 0' <<<"$resp")
  EDGE_BYTES=$(jq '[.data.viewer.zones[0].httpRequests1hGroups[].sum.bytes] | add // 0' <<<"$resp")
  local cbytes; cbytes=$(jq '[.data.viewer.zones[0].httpRequests1hGroups[].sum.cachedBytes] | add // 0' <<<"$resp")
  ORIGIN_BYTES=$(( EDGE_BYTES - cbytes ))
  HIT_RATIO=$(awk -v c="$cached" -v t="$REQ_TOTAL" 'BEGIN{ if(t>0) printf "%.4f", c/t; else print 0 }')
  ERR_4XX=$(jq '[.data.viewer.zones[0].httpRequests1hGroups[].sum.responseStatusMap[] | select(.edgeResponseStatus>=400 and .edgeResponseStatus<500) | .requests] | add // 0' <<<"$resp")
  ERR_5XX=$(jq '[.data.viewer.zones[0].httpRequests1hGroups[].sum.responseStatusMap[] | select(.edgeResponseStatus>=500) | .requests] | add // 0' <<<"$resp")
  # TTFB percentiles require the Cloudflare "firstByteTime" adaptive dataset;
  # left as 0 when the plan/dataset is unavailable.
}

# ── CloudFront (CloudWatch metrics) ─────────────────────────────────────
report_cloudfront() {
  [[ -n "${CLOUDFRONT_DISTRIBUTION_ID:-}" ]] || { log "cloudfront not configured"; return 1; }
  command -v aws >/dev/null || return 1
  local dims="Name=DistributionId,Value=${CLOUDFRONT_DISTRIBUTION_ID} Name=Region,Value=Global"
  cw() { aws cloudwatch get-metric-statistics --namespace AWS/CloudFront \
      --metric-name "$1" --dimensions $dims --start-time "$START" --end-time "$END" \
      --period 86400 --statistics "$2" --query "Datapoints[].$2" --output text 2>/dev/null; }
  REQ_TOTAL=$(cw Requests Sum | awk '{s+=$1} END{print s+0}')
  HIT_RATIO=$(cw CacheHitRate Average | awk '{s+=$1;n++} END{ if(n>0) printf "%.4f", s/n/100; else print 0 }')
  local err5; err5=$(cw 5xxErrorRate Average | awk '{s+=$1;n++} END{ if(n>0) print s/n; else print 0 }')
  local err4; err4=$(cw 4xxErrorRate Average | awk '{s+=$1;n++} END{ if(n>0) print s/n; else print 0 }')
  ERR_5XX=$(awk -v r="$err5" -v t="$REQ_TOTAL" 'BEGIN{printf "%.0f", r/100*t}')
  ERR_4XX=$(awk -v r="$err4" -v t="$REQ_TOTAL" 'BEGIN{printf "%.0f", r/100*t}')
  EDGE_BYTES=$(cw BytesDownloaded Sum | awk '{s+=$1} END{print s+0}')
  ORIGIN_BYTES=$(awk -v e="$EDGE_BYTES" -v h="$HIT_RATIO" 'BEGIN{printf "%.0f", e*(1-h)}')
}

case "$PROVIDER" in
  cloudflare) report_cloudflare || log "falling back to zeros" ;;
  cloudfront) report_cloudfront || log "falling back to zeros" ;;
  *) log "unknown provider $PROVIDER" ;;
esac

OFFLOAD_GB=$(awk -v e="$EDGE_BYTES" -v o="$ORIGIN_BYTES" 'BEGIN{printf "%.2f", (e-o)/1073741824}')
SAVED_USD=$(awk -v gb="$OFFLOAD_GB" -v p="$ORIGIN_USD_PER_GB" 'BEGIN{printf "%.2f", gb*p}')
HIT_PCT=$(awk -v h="$HIT_RATIO" 'BEGIN{printf "%.2f", h*100}')

{
  echo "## CDN performance report — $(date -u +%Y-%m-%d) (${SINCE}, ${PROVIDER})"
  echo
  echo "| Metric | Value | Target |"
  echo "|--------|-------|--------|"
  echo "| Requests | $(printf "%'d" "$REQ_TOTAL" 2>/dev/null || echo "$REQ_TOTAL") | — |"
  echo "| Cache hit ratio | **${HIT_PCT}%** | ≥ 95% |"
  echo "| Edge bytes served | $(awk -v b="$EDGE_BYTES" 'BEGIN{printf "%.1f GB", b/1073741824}') | — |"
  echo "| Origin bytes (misses) | $(awk -v b="$ORIGIN_BYTES" 'BEGIN{printf "%.1f GB", b/1073741824}') | minimise |"
  echo "| Origin offload | ${OFFLOAD_GB} GB → ~\$${SAVED_USD} saved | ≥ 30% cost cut |"
  echo "| Edge TTFB p50 / p95 | ${TTFB_P50} / ${TTFB_P95} ms | p95 < 100 ms |"
  echo "| 4xx / 5xx | ${ERR_4XX} / ${ERR_5XX} | 5xx ≈ 0 |"
  echo
  echo "### Top cache MISS paths"
  echo
  echo "$TOP_MISS"
  echo
  awk -v h="$HIT_RATIO" -v t="$HIT_TARGET" 'BEGIN{ if(h<t) print "> ⚠️ Hit ratio is below target — review cache-key normalisation and TTLs in ops/cdn/." }'
} > "$MD_OUT"

{
  echo "# HELP hw_cdn_cache_hit_ratio Edge cache hit ratio (0-1)"
  echo "# TYPE hw_cdn_cache_hit_ratio gauge"
  echo "hw_cdn_cache_hit_ratio{provider=\"$PROVIDER\"} $HIT_RATIO"
  echo "hw_cdn_requests_total{provider=\"$PROVIDER\"} $REQ_TOTAL"
  echo "hw_cdn_edge_bytes{provider=\"$PROVIDER\"} $EDGE_BYTES"
  echo "hw_cdn_origin_bytes{provider=\"$PROVIDER\"} $ORIGIN_BYTES"
  echo "hw_cdn_origin_offload_usd_saved{provider=\"$PROVIDER\"} $SAVED_USD"
  echo "hw_cdn_edge_errors_total{provider=\"$PROVIDER\",class=\"4xx\"} $ERR_4XX"
  echo "hw_cdn_edge_errors_total{provider=\"$PROVIDER\",class=\"5xx\"} $ERR_5XX"
  echo "hw_cdn_report_timestamp_seconds $(date +%s)"
} > "$METRICS_FILE"

log "report → $MD_OUT ; metrics → $METRICS_FILE"
cat "$MD_OUT"
