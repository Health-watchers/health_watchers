#!/bin/bash

##############################################################################
# Auto-Scaling Test Script
# Tests HPA scaling behavior by simulating load
##############################################################################

set -e

NAMESPACE="health-watchers"
API_HPA="api-hpa"
WEB_HPA="web-hpa"
DURATION_SECONDS=300
INTERVAL_SECONDS=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_warning "jq not found. JSON output will not be formatted."
    fi

    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_error "Namespace '$NAMESPACE' not found"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Get current HPA status
get_hpa_status() {
    local hpa_name=$1

    log_info "Checking HPA status for: $hpa_name"
    kubectl get hpa "$hpa_name" -n "$NAMESPACE" \
        -o jsonpath='{
            "name": .metadata.name,
            "minReplicas": .spec.minReplicas,
            "maxReplicas": .spec.maxReplicas,
            "currentReplicas": .status.currentReplicas,
            "desiredReplicas": .status.desiredReplicas,
            "metrics": .spec.metrics[*].resource.target.averageUtilization
        }' 2>/dev/null | jq . 2>/dev/null || \
        kubectl get hpa "$hpa_name" -n "$NAMESPACE"
}

# Get pod metrics
get_pod_metrics() {
    local label=$1

    log_info "Pod metrics for label: $label"

    if kubectl top pods -n "$NAMESPACE" -l "$label" &> /dev/null; then
        kubectl top pods -n "$NAMESPACE" -l "$label"
    else
        log_warning "Metrics server may not be available"
    fi
}

# Monitor HPA scaling over time
monitor_hpa_scaling() {
    local hpa_name=$1
    local duration=$2
    local interval=$3

    log_info "Monitoring HPA scaling for $duration seconds (interval: ${interval}s)"

    local start_time=$(date +%s)
    local iteration=0

    echo ""
    printf "%-5s %-20s %-20s %-20s %-15s\n" "Iter" "Time" "Current" "Desired" "Status"
    printf "%s\n" "$(printf '%0.s-' {1..80})"

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [ $elapsed -gt $duration ]; then
            break
        fi

        local current=$(kubectl get hpa "$hpa_name" -n "$NAMESPACE" \
            -o jsonpath='{.status.currentReplicas}')
        local desired=$(kubectl get hpa "$hpa_name" -n "$NAMESPACE" \
            -o jsonpath='{.status.desiredReplicas}')
        local status=$(kubectl get hpa "$hpa_name" -n "$NAMESPACE" \
            -o jsonpath='{.status.conditions[0].reason}' || echo "Unknown")

        printf "%-5d %-20s %-20s %-20s %-15s\n" \
            "$iteration" \
            "$(date '+%H:%M:%S')" \
            "$current" \
            "$desired" \
            "$status"

        sleep "$interval"
        ((iteration++))
    done

    echo ""
}

# Test scaling up
test_scale_up() {
    log_info "Testing scale-up behavior..."

    local api_pod=$(kubectl get pods -n "$NAMESPACE" -l app=api \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [ -z "$api_pod" ]; then
        log_error "No API pods found"
        return 1
    fi

    log_info "Using pod: $api_pod for load generation"

    # Generate CPU load
    log_info "Generating CPU load (this will increase pod count)..."

    # Create a load generator pod
    kubectl run -n "$NAMESPACE" load-generator \
        --image=busybox \
        --restart=Never \
        -- sh -c "while sleep 0.01; do echo 'load'; done" \
        2>/dev/null || true

    log_info "Load generator started. Monitoring scaling..."
    monitor_hpa_scaling "$API_HPA" 60 5

    # Cleanup
    kubectl delete pod load-generator -n "$NAMESPACE" 2>/dev/null || true

    log_success "Scale-up test completed"
}

# Test scaling down
test_scale_down() {
    log_info "Testing scale-down behavior..."
    log_info "Removing load. HPA should scale down after stabilization window..."

    monitor_hpa_scaling "$API_HPA" 120 10

    log_success "Scale-down test completed"
}

# Verify HPA configuration
verify_hpa_config() {
    log_info "Verifying HPA configurations..."

    for hpa_name in "$API_HPA" "$WEB_HPA"; do
        log_info "Checking $hpa_name..."

        local min_replicas=$(kubectl get hpa "$hpa_name" -n "$NAMESPACE" \
            -o jsonpath='{.spec.minReplicas}' 2>/dev/null)
        local max_replicas=$(kubectl get hpa "$hpa_name" -n "$NAMESPACE" \
            -o jsonpath='{.spec.maxReplicas}' 2>/dev/null)
        local metrics=$(kubectl get hpa "$hpa_name" -n "$NAMESPACE" \
            -o jsonpath='{.spec.metrics[*].resource.name}' 2>/dev/null)

        echo "  Min Replicas: $min_replicas"
        echo "  Max Replicas: $max_replicas"
        echo "  Metrics: $metrics"
    done

    log_success "HPA verification completed"
}

# Generate metrics report
generate_report() {
    log_info "Generating scaling report..."

    local report_file="/tmp/autoscaling-report-$(date +%s).txt"

    {
        echo "=========================================="
        echo "Auto-Scaling Test Report"
        echo "Generated: $(date)"
        echo "=========================================="
        echo ""

        echo "API HPA Status:"
        get_hpa_status "$API_HPA"
        echo ""

        echo "Web HPA Status:"
        get_hpa_status "$WEB_HPA"
        echo ""

        echo "API Pod Metrics:"
        get_pod_metrics "app=api"
        echo ""

        echo "Web Pod Metrics:"
        get_pod_metrics "app=web"
        echo ""

        echo "Recent HPA Events:"
        kubectl get events -n "$NAMESPACE" --sort-by='.lastTimestamp' \
            | grep -i horizontal || echo "No horizontal scaling events found"
        echo ""

    } | tee "$report_file"

    log_success "Report saved to: $report_file"
}

# Main test suite
main() {
    log_info "Starting Auto-Scaling Test Suite"
    echo ""

    check_prerequisites
    echo ""

    verify_hpa_config
    echo ""

    get_hpa_status "$API_HPA"
    echo ""

    get_pod_metrics "app=api"
    echo ""

    # Optional: Run load tests
    read -p "Run load test to trigger scaling? (y/n): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        test_scale_up
        echo ""
        test_scale_down
        echo ""
    fi

    generate_report

    log_success "Auto-Scaling Test Suite completed"
}

# Run main function
main "$@"
