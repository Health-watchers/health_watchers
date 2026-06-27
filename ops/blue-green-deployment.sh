#!/bin/bash
set -euo pipefail

# Blue-Green Deployment Script
# Implements zero-downtime deployment strategy

DEPLOYMENT_NAME="${1:?Deployment name required}"
IMAGE="${2:?Docker image required}"
NAMESPACE="${3:-default}"
LB_SELECTOR="${4:-app=health-watchers}"
TIMEOUT="${5:-300}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Get current active deployment
get_active_deployment() {
  kubectl get service "$DEPLOYMENT_NAME-service" -n "$NAMESPACE" -o jsonpath='{.spec.selector.version}' 2>/dev/null || echo "blue"
}

# Get inactive deployment slot
get_inactive_deployment() {
  local active="$1"
  if [[ "$active" == "blue" ]]; then
    echo "green"
  else
    echo "blue"
  fi
}

# Deploy to inactive slot
deploy_to_slot() {
  local slot="$1"
  local image="$2"
  
  log_info "Deploying to $slot slot"
  
  kubectl set image "deployment/$DEPLOYMENT_NAME-$slot" \
    "app=$image" \
    -n "$NAMESPACE" \
    --record
  
  kubectl rollout status "deployment/$DEPLOYMENT_NAME-$slot" \
    -n "$NAMESPACE" \
    --timeout="${TIMEOUT}s"
  
  log_success "$slot deployment updated"
}

# Verify deployment health
verify_deployment() {
  local slot="$1"
  
  log_info "Verifying $slot deployment health"
  
  local replicas=$(kubectl get deployment "$DEPLOYMENT_NAME-$slot" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')
  local desired=$(kubectl get deployment "$DEPLOYMENT_NAME-$slot" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')
  
  if [[ "$replicas" -eq "$desired" ]]; then
    log_success "$slot deployment healthy"
    return 0
  else
    log_error "$slot deployment unhealthy ($replicas/$desired ready)"
    return 1
  fi
}

# Switch load balancer to new slot
switch_traffic() {
  local slot="$1"
  
  log_info "Switching traffic to $slot"
  
  kubectl patch service "$DEPLOYMENT_NAME-service" \
    -n "$NAMESPACE" \
    -p "{\"spec\":{\"selector\":{\"version\":\"$slot\"}}}"
  
  log_success "Traffic switched to $slot"
}

# Rollback to previous deployment
rollback() {
  local from="$1"
  local to="$2"
  
  log_info "Rolling back from $from to $to"
  
  switch_traffic "$to"
  
  log_success "Rollback complete"
}

# Main deployment flow
main() {
  local active_slot
  local inactive_slot
  
  active_slot=$(get_active_deployment)
  inactive_slot=$(get_inactive_deployment "$active_slot")
  
  log_info "Active deployment: $active_slot"
  log_info "Target deployment: $inactive_slot"
  
  # Deploy to inactive slot
  if ! deploy_to_slot "$inactive_slot" "$IMAGE"; then
    log_error "Deployment to $inactive_slot failed"
    return 1
  fi
  
  # Verify health
  if ! verify_deployment "$inactive_slot"; then
    log_error "Health check failed for $inactive_slot"
    return 1
  fi
  
  # Switch traffic
  switch_traffic "$inactive_slot"
  
  # Wait for connection draining (example)
  sleep 5
  
  log_success "Blue-Green deployment completed successfully"
  log_info "Previous slot: $active_slot (standby)"
  log_info "Current slot: $inactive_slot (active)"
}

main "$@"
