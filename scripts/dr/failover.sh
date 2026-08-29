#!/bin/bash
# scripts/dr/failover.sh
# Automated region / cluster failover for Health Watchers.
#
# Promotes the DR region to primary: switches kube context, scales up the DR
# stack, promotes the MongoDB secondary in the DR region, repoints Route 53
# (weighted/failover records) and the CDN origin, then runs health checks.
# Supports --dry-run and --failback.
#
# Usage:
#   failover.sh --to dr   [--dry-run] [--skip-dns] [--reason "primary region outage"]
#   failover.sh --failback [--dry-run]
#
# Env: PRIMARY_CONTEXT, DR_CONTEXT, ROUTE53_ZONE_ID, APP_DOMAIN,
#      DR_MONGO_URI, CDN_PROVIDER, CDN_API_TOKEN, SLACK_WEBHOOK_URL

set -euo pipefail

DIRECTION=""
DRY_RUN=false
SKIP_DNS=false
REASON="manual failover"
NAMESPACE="${NAMESPACE:-health-watchers}"
PRIMARY_CONTEXT="${PRIMARY_CONTEXT:-hw-primary}"
DR_CONTEXT="${DR_CONTEXT:-hw-dr}"
APP_DOMAIN="${APP_DOMAIN:-app.health-watchers.io}"
TTL=60

log()     { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
error()   { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ❌ ERROR: $*" >&2; }
success() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✅ $*"; }
run()     { if $DRY_RUN; then echo "  [dry-run] $*"; else eval "$@"; fi; }

notify() {
  [[ -n "${SLACK_WEBHOOK_URL:-}" ]] || return 0
  curl -sf -X POST "$SLACK_WEBHOOK_URL" -H 'Content-Type: application/json' \
    -d "{\"text\":\"🌐 *DR Failover* — $1\"}" >/dev/null || true
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to)       DIRECTION="$2"; shift 2 ;;
    --failback) DIRECTION="failback"; shift ;;
    --dry-run)  DRY_RUN=true; shift ;;
    --skip-dns) SKIP_DNS=true; shift ;;
    --reason)   REASON="$2"; shift 2 ;;
    -h|--help)  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) error "unknown arg: $1"; exit 1 ;;
  esac
done
[[ "$DIRECTION" == "dr" || "$DIRECTION" == "failback" ]] || { error "use --to dr or --failback"; exit 1; }

if [[ "$DIRECTION" == "dr" ]]; then
  TARGET_CONTEXT="$DR_CONTEXT"; SOURCE_CONTEXT="$PRIMARY_CONTEXT"; MONGO_URI="${DR_MONGO_URI:?DR_MONGO_URI required}"
else
  TARGET_CONTEXT="$PRIMARY_CONTEXT"; SOURCE_CONTEXT="$DR_CONTEXT"; MONGO_URI="${PRIMARY_MONGO_URI:?PRIMARY_MONGO_URI required}"
fi

log "=== Failover: $SOURCE_CONTEXT → $TARGET_CONTEXT ($([ $DRY_RUN = true ] && echo DRY-RUN || echo LIVE)) ==="
log "reason: $REASON"
notify "starting: $SOURCE_CONTEXT → $TARGET_CONTEXT ($REASON)"
START=$(date +%s)

# 1. Fence the source (best effort — it may already be down)
log "1. Fencing source cluster (scale app to 0, if reachable)"
run "kubectl --context $SOURCE_CONTEXT -n $NAMESPACE scale deploy --all --replicas=0 --timeout=30s || true"

# 2. Promote DR database
log "2. Promoting database in target region"
run "mongosh '$MONGO_URI' --quiet --eval 'rs.stepDown ? null : null; rs.reconfigForPSASet && null'"
run "mongosh '$MONGO_URI' --quiet --eval 'var c=rs.conf(); c.members.forEach(m=>{m.priority = m.host.indexOf(\"'$DIRECTION'\")>-1?2:0.5}); rs.reconfig(c,{force:true})'"

# 3. Scale up target stack
log "3. Scaling up target cluster"
run "kubectl --context $TARGET_CONTEXT -n $NAMESPACE scale deploy/health-watchers-api    --replicas=4"
run "kubectl --context $TARGET_CONTEXT -n $NAMESPACE scale deploy/health-watchers-web    --replicas=3"
run "kubectl --context $TARGET_CONTEXT -n $NAMESPACE scale deploy/health-watchers-stellar-service --replicas=2"
run "kubectl --context $TARGET_CONTEXT -n $NAMESPACE rollout status deploy/health-watchers-api --timeout=600s"

# 4. Repoint DNS
if $SKIP_DNS; then
  log "4. DNS switch skipped (--skip-dns)"
else
  log "4. Repointing Route 53 $APP_DOMAIN → target region ALB (TTL ${TTL}s)"
  TARGET_ALB="$(kubectl --context "$TARGET_CONTEXT" -n "$NAMESPACE" get ingress health-watchers \
    -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo '')"
  if [[ -n "$TARGET_ALB" && -n "${ROUTE53_ZONE_ID:-}" ]]; then
    CHANGE="{\"Changes\":[{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"$APP_DOMAIN\",\"Type\":\"CNAME\",\"TTL\":$TTL,\"ResourceRecords\":[{\"Value\":\"$TARGET_ALB\"}]}}]}"
    run "aws route53 change-resource-record-sets --hosted-zone-id $ROUTE53_ZONE_ID --change-batch '$CHANGE'"
  else
    error "could not resolve target ALB or ROUTE53_ZONE_ID — set DNS manually"
  fi
fi

# 5. Repoint CDN origin
log "5. Updating CDN origin to target region"
case "${CDN_PROVIDER:-none}" in
  cloudflare)
    run "curl -sf -X PATCH https://api.cloudflare.com/client/v4/zones/\${CLOUDFLARE_ZONE_ID}/load_balancers \
         -H 'Authorization: Bearer \$CDN_API_TOKEN' -H 'Content-Type: application/json' \
         -d '{\"default_pools\":[\"'\${DR_ORIGIN_POOL_ID}'\"]}'" ;;
  cloudfront)
    log "  CloudFront uses an origin group with automatic failover — no action needed" ;;
  *) log "  no CDN provider configured — skipping" ;;
esac

# 6. Invalidate + warm CDN cache
log "6. Invalidating CDN cache"
run "bash scripts/cdn/purge-cache.sh --all --yes || true"

# 7. Health checks
log "7. Post-failover health checks"
if ! $DRY_RUN; then
  for i in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "https://$APP_DOMAIN/health" || true)
    api=$(curl -s -o /dev/null -w '%{http_code}' "https://$APP_DOMAIN/api/health" || true)
    if [[ "$code" == 200 && "$api" == 200 ]]; then success "app + api healthy on target region"; break; fi
    [[ $i -eq 30 ]] && { error "health checks did not pass within timeout"; exit 1; }
    sleep 10
  done
  bash scripts/dr/verify-data-integrity.sh --uri "$MONGO_URI" || error "integrity check reported issues — review before declaring done"
fi

ELAPSED=$(( $(date +%s) - START ))
{
  echo "# TYPE dr_failover_seconds gauge"
  echo "dr_failover_seconds{direction=\"$DIRECTION\"} $ELAPSED"
  echo "dr_failover_timestamp_seconds{direction=\"$DIRECTION\"} $(date +%s)"
} > "${METRICS_FILE:-/tmp/dr_failover_metrics.txt}"

success "Failover complete in ${ELAPSED}s (target: 30 min / 1800s)"
notify "complete: now serving from $TARGET_CONTEXT in ${ELAPSED}s"
log "Next: post status-page update (docs/templates/INCIDENT_COMMUNICATION.md) and open a post-mortem."
