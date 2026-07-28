#!/bin/bash
set -euo pipefail

# Rollback script for Blue-Green deployment

DEPLOYMENT_NAME="${1:?Deployment name required}"
NAMESPACE="${2:-default}"

log_info() {
  echo "[INFO] $*"
}

log_success() {
  echo "[SUCCESS] $*"
}

log_error() {
  echo "[ERROR] $*" >&2
  exit 1
}

# Get current active deployment
get_active_slot() {
  kubectl get service "$DEPLOYMENT_NAME-service" -n "$NAMESPACE" -o jsonpath='{.spec.selector.version}'
}

# Get previous slot
get_previous_slot() {
  local current="$1"
  if [[ "$current" == "blue" ]]; then
    echo "green"
  else
    echo "blue"
  fi
}

main() {
  local current_slot
  local previous_slot
  
  current_slot=$(get_active_slot)
  previous_slot=$(get_previous_slot "$current_slot")
  
  log_info "Current active: $current_slot"
  log_info "Rolling back to: $previous_slot"
  
  kubectl patch service "$DEPLOYMENT_NAME-service" \
    -n "$NAMESPACE" \
    -p "{\"spec\":{\"selector\":{\"version\":\"$previous_slot\"}}}"
  
  log_success "Rollback to $previous_slot completed"
}

main "$@"
