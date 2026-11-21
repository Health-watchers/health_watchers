#!/bin/bash

# Test suite for SSL/TLS Certificate Management
#
# Validates the actual cert-manager manifests in k8s/cert-manager-setup.yaml
# instead of comparing hardcoded strings. Optionally runs a live staging
# renewal test when kubectl is available and STAGING=true.

PASSED=0
FAILED=0
SKIPPED=0
NAMESPACE="health-watchers"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${CERT_MANAGER_MANIFEST:-$SCRIPT_DIR/cert-manager-setup.yaml}"
MANIFEST_CONTENT=""

assert_equals() {
  local expected="$1"
  local actual="$2"
  local message="$3"
  
  if [[ "$expected" == "$actual" ]]; then
    echo "✓ $message"
    ((PASSED++))
  else
    echo "✗ $message (expected: $expected, got: $actual)"
    ((FAILED++))
  fi
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local message="$3"
  
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "✓ $message"
    ((PASSED++))
  else
    echo "✗ $message"
    ((FAILED++))
  fi
}

skip() {
  local message="$1"
  echo "⊘ SKIPPED: $message"
  ((SKIPPED++))
}

# Load the manifest once; fail fast if it is missing.
load_manifest() {
  if [[ ! -f "$MANIFEST" ]]; then
    echo "✗ Manifest not found: $MANIFEST"
    exit 1
  fi
  MANIFEST_CONTENT="$(cat "$MANIFEST")"
}

# Test: Certificate CRD definition
test_certificate_crd() {
  echo "Testing Certificate CRD..."
  
  assert_contains "$MANIFEST_CONTENT" "kind: Certificate" "Certificate resource defined"
  assert_contains "$MANIFEST_CONTENT" "cert-manager.io" "cert-manager API group referenced"
}

# Test: Issuer configuration
test_issuer_config() {
  echo "Testing Issuer Configuration..."
  
  # Verify Let's Encrypt production ACME server
  assert_contains "$MANIFEST_CONTENT" \
    "https://acme-v02.api.letsencrypt.org/directory" \
    "Let's Encrypt production ACME server URL present"
  
  # Verify Let's Encrypt staging ACME server
  assert_contains "$MANIFEST_CONTENT" \
    "https://acme-staging-v02.api.letsencrypt.org/directory" \
    "Let's Encrypt staging ACME server URL present"
}

# Test: Certificate configuration
test_certificate_config() {
  echo "Testing Certificate Configuration..."
  
  # Verify DNS names
  assert_contains "$MANIFEST_CONTENT" "api.healthwatchers.com" "Certificate includes primary domain"
  
  # Verify renewal period (720h = 30 days)
  assert_contains "$MANIFEST_CONTENT" "renewBefore: 720h" "Renewal before period set to 720h"
}

# Test: Alert rules for expiry monitoring
test_alert_rules() {
  echo "Testing Alert Rules..."
  
  # 30-day expiry alert expression
  assert_contains "$MANIFEST_CONTENT" "CertificateExpirySoon" "30-day expiry alert defined"
  assert_contains "$MANIFEST_CONTENT" "certmanager_certificate_expiration_timestamp_seconds" \
    "Expiry alert uses cert-manager expiration metric"
  assert_contains "$MANIFEST_CONTENT" "30 \* 24 \* 3600" "Expiry alert threshold is 30 days"
  
  # Not-Ready alert
  assert_contains "$MANIFEST_CONTENT" "CertificateNotReady" "Not-Ready alert defined"
  assert_contains "$MANIFEST_CONTENT" "certmanager_certificate_ready_status" \
    "Not-Ready alert uses cert-manager ready metric"
}

# Test: Secret reference
test_secret_reference() {
  echo "Testing Secret Reference..."
  
  assert_contains "$MANIFEST_CONTENT" "health-watchers-tls" "Certificate stores secret correctly"
}

# Test: Namespace context
test_namespace() {
  echo "Testing Namespace Context..."
  
  assert_contains "$MANIFEST_CONTENT" "namespace: $NAMESPACE" "Correct namespace configured"
}

# Test: HTTP01 solver configuration
test_http01_solver() {
  echo "Testing HTTP01 Solver..."
  
  assert_contains "$MANIFEST_CONTENT" "http01" "HTTP01 challenge solver configured"
}

# Test: Staging renewal (live, opt-in)
test_staging_renewal() {
  echo "Testing Staging Renewal..."

  if [[ "${STAGING:-false}" != "true" ]]; then
    skip "STAGING not set to true; skipping live renewal test"
    return
  fi

  if ! command -v kubectl >/dev/null 2>&1; then
    skip "kubectl not available; skipping live renewal test"
    return
  fi

  if ! kubectl cluster-info >/dev/null 2>&1; then
    skip "No reachable cluster; skipping live renewal test"
    return
  fi

  local name="renewal-test"
  local secret="${name}-tls"
  local issuer="letsencrypt-staging"

  cleanup() {
    kubectl delete certificate "$name" -n "$NAMESPACE" --ignore-not-found >/dev/null 2>&1
    kubectl delete secret "$secret" -n "$NAMESPACE" --ignore-not-found >/dev/null 2>&1
  }
  trap cleanup RETURN

  # Short-validity certificate using the staging issuer and a short renewBefore.
  cat <<EOF | kubectl apply -f - >/dev/null 2>&1
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: $name
  namespace: $NAMESPACE
spec:
  secretName: $secret
  duration: 24h
  renewBefore: 12h
  dnsNames:
    - renewal-test.healthwatchers.com
  issuerRef:
    name: $issuer
    kind: ClusterIssuer
EOF

  if ! kubectl wait --for=condition=Ready certificate/"$name" -n "$NAMESPACE" --timeout=300s >/dev/null 2>&1; then
    echo "✗ Certificate did not become Ready"
    ((FAILED++))
    return
  fi
  echo "✓ Certificate issued via staging issuer"
  ((PASSED++))

  local first_serial
  first_serial="$(kubectl get secret "$secret" -n "$NAMESPACE" -o jsonpath='{.data.tls\.crt}' 2>/dev/null | base64 -d 2>/dev/null | openssl x509 -noout -serial 2>/dev/null)"

  # Force re-issuance by deleting the secret.
  kubectl delete secret "$secret" -n "$NAMESPACE" --ignore-not-found >/dev/null 2>&1

  if ! kubectl wait --for=condition=Ready certificate/"$name" -n "$NAMESPACE" --timeout=300s >/dev/null 2>&1; then
    echo "✗ Certificate did not re-issue after secret deletion"
    ((FAILED++))
    return
  fi

  local second_serial
  second_serial="$(kubectl get secret "$secret" -n "$NAMESPACE" -o jsonpath='{.data.tls\.crt}' 2>/dev/null | base64 -d 2>/dev/null | openssl x509 -noout -serial 2>/dev/null)"

  if [[ -n "$first_serial" && -n "$second_serial" && "$first_serial" != "$second_serial" ]]; then
    echo "✓ Certificate re-issued with new serial"
    ((PASSED++))
  else
    echo "✗ Certificate was not re-issued (serial unchanged or missing)"
    ((FAILED++))
  fi
}

run_tests() {
  echo "Running SSL/TLS Certificate Management Tests..."
  echo "================================================"
  
  load_manifest
  
  test_certificate_crd
  test_issuer_config
  test_certificate_config
  test_alert_rules
  test_secret_reference
  test_namespace
  test_http01_solver
  test_staging_renewal
  
  echo "================================================"
  echo "Tests Passed: $PASSED"
  echo "Tests Failed: $FAILED"
  echo "Tests Skipped: $SKIPPED"
  
  if [[ $FAILED -gt 0 ]]; then
    exit 1
  fi
}

run_tests
