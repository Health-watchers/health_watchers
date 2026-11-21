#!/bin/bash

# Test suite for SSL/TLS Certificate Management
# Validates the actual manifest in k8s/cert-manager-setup.yaml.

PASSED=0
FAILED=0
NAMESPACE="health-watchers"
MANIFEST="$(dirname "$0")/cert-manager-setup.yaml"

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

assert_manifest_contains() {
  local needle="$1"
  local message="$2"

  if grep -qF -- "$needle" "$MANIFEST"; then
    echo "✓ $message"
    ((PASSED++))
  else
    echo "✗ $message (missing: $needle)"
    ((FAILED++))
  fi
}

# Test: Certificate CRD definition
test_certificate_crd() {
  echo "Testing Certificate CRD..."

  assert_manifest_contains "certificates.cert-manager.io" "Certificate CRD defined"
}

# Test: Issuer configuration
test_issuer_config() {
  echo "Testing Issuer Configuration..."

  assert_manifest_contains "https://acme-v02.api.letsencrypt.org/directory" "Let's Encrypt ACME v02 server configured"
  assert_manifest_contains "name: letsencrypt-prod" "letsencrypt-prod issuer defined"
}

# Test: Certificate configuration
test_certificate_config() {
  echo "Testing Certificate Configuration..."

  assert_manifest_contains "api.healthwatchers.com" "Certificate includes primary domain"
  assert_manifest_contains "www.healthwatchers.com" "Certificate includes www domain"
  assert_manifest_contains "renewBefore: 720h" "Renewal before period set to 720 hours (30 days)"
}

# Test: Alert rules for expiry monitoring
test_alert_rules() {
  echo "Testing Alert Rules..."

  assert_manifest_contains "CertificateExpiry30Days" "30-day expiry alert defined"
  assert_manifest_contains "30*24*3600" "30-day expiry expression present"
  assert_manifest_contains "CertificateExpirySoon" "7-day expiry alert defined"
  assert_manifest_contains "CertificateExpiryImmediate" "24-hour expiry alert defined"
  assert_manifest_contains "runbook_url" "Alerts reference the renewal runbook"
}

# Test: Secret reference
test_secret_reference() {
  echo "Testing Secret Reference..."

  assert_manifest_contains "secretName: health-watchers-tls" "Certificate stores secret correctly"
}

# Test: Namespace context
test_namespace() {
  echo "Testing Namespace Context..."

  assert_manifest_contains "namespace: $NAMESPACE" "Correct namespace configured"
}

# Test: HTTP01 solver configuration
test_http01_solver() {
  echo "Testing HTTP01 Solver..."

  assert_manifest_contains "http01" "HTTP01 challenge solver configured"
}

run_tests() {
  echo "Running SSL/TLS Certificate Management Tests..."
  echo "================================================"

  if [[ ! -f "$MANIFEST" ]]; then
    echo "✗ Manifest not found: $MANIFEST"
    exit 1
  fi

  test_certificate_crd
  test_issuer_config
  test_certificate_config
  test_alert_rules
  test_secret_reference
  test_namespace
  test_http01_solver

  echo "================================================"
  echo "Tests Passed: $PASSED"
  echo "Tests Failed: $FAILED"

  if [[ $FAILED -gt 0 ]]; then
    exit 1
  fi
}

run_tests
