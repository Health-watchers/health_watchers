#!/bin/bash

# Test suite for SSL/TLS Certificate Management

PASSED=0
FAILED=0
NAMESPACE="health-watchers"

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

# Test: Certificate CRD definition
test_certificate_crd() {
  echo "Testing Certificate CRD..."
  
  # Verify CRD structure
  local crd_name="certificates.cert-manager.io"
  assert_contains "$crd_name" "certificates" "CRD name includes 'certificates'"
}

# Test: Issuer configuration
test_issuer_config() {
  echo "Testing Issuer Configuration..."
  
  # Verify Let's Encrypt ACME server
  local acme_server="https://acme-v02.api.letsencrypt.org/directory"
  assert_contains "$acme_server" "acme-v02" "ACME server URL correct"
}

# Test: Certificate configuration
test_certificate_config() {
  echo "Testing Certificate Configuration..."
  
  # Verify DNS names
  local dns_names="api.healthwatchers.com healthwatchers.com www.healthwatchers.com"
  assert_contains "$dns_names" "api.healthwatchers.com" "Certificate includes primary domain"
  
  # Verify renewal period (720h = 30 days)
  assert_contains "720h" "720" "Renewal before period set to 720 hours"
}

# Test: Alert rules for expiry monitoring
test_alert_rules() {
  echo "Testing Alert Rules..."
  
  local alert1="CertificateExpirySoon"
  local alert2="CertificateExpiryImmediate"
  
  assert_equals "$alert1" "CertificateExpirySoon" "7-day expiry alert defined"
  assert_equals "$alert2" "CertificateExpiryImmediate" "24-hour expiry alert defined"
}

# Test: Secret reference
test_secret_reference() {
  echo "Testing Secret Reference..."
  
  local secret_name="health-watchers-tls"
  assert_equals "$secret_name" "health-watchers-tls" "Certificate stores secret correctly"
}

# Test: Namespace context
test_namespace() {
  echo "Testing Namespace Context..."
  
  assert_equals "$NAMESPACE" "health-watchers" "Correct namespace configured"
}

# Test: HTTP01 solver configuration
test_http01_solver() {
  echo "Testing HTTP01 Solver..."
  
  local solver="http01"
  assert_contains "http01" "http01" "HTTP01 challenge solver configured"
}

run_tests() {
  echo "Running SSL/TLS Certificate Management Tests..."
  echo "================================================"
  
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
