#!/bin/bash

# Test suite for Architecture Documentation

DOC_FILE="ARCHITECTURE.md"
PASSED=0
FAILED=0

assert_contains_section() {
  local section="$1"
  local message="$2"
  
  if grep -q "## $section" "$DOC_FILE"; then
    echo "✓ $message"
    ((PASSED++))
  else
    echo "✗ $message"
    ((FAILED++))
  fi
}

assert_contains_text() {
  local text="$1"
  local message="$2"
  
  if grep -q "$text" "$DOC_FILE"; then
    echo "✓ $message"
    ((PASSED++))
  else
    echo "✗ $message"
    ((FAILED++))
  fi
}

test_architecture_doc() {
  echo "Testing Architecture Documentation..."
  echo "========================================"
  
  # Test main sections
  assert_contains_section "Overview" "Overview section exists"
  assert_contains_section "Component Architecture" "Component Architecture section exists"
  assert_contains_section "Data Flow Diagrams" "Data Flow Diagrams section exists"
  assert_contains_section "Deployment Architecture" "Deployment Architecture section exists"
  assert_contains_section "Integration Points" "Integration Points section exists"
  assert_contains_section "Disaster Recovery" "Disaster Recovery section exists"
  assert_contains_section "Monitoring & Observability" "Monitoring & Observability section exists"
  assert_contains_section "Security Considerations" "Security Considerations section exists"
  
  # Test component documentation
  assert_contains_text "Frontend Layer" "Frontend Layer documented"
  assert_contains_text "API Service" "API Service documented"
  assert_contains_text "Stellar Service" "Stellar Service documented"
  assert_contains_text "MongoDB" "Database components documented"
  
  # Test diagrams
  assert_contains_text "Architecture Diagram" "High-level diagram exists"
  assert_contains_text "Patient Registration Flow" "Patient flow diagram exists"
  assert_contains_text "Payment Processing Flow" "Payment flow diagram exists"
  
  # Test deployment info
  assert_contains_text "Kubernetes" "Kubernetes deployment documented"
  assert_contains_text "Blue-Green" "Blue-green deployment strategy documented"
  
  # Test data flow clarity
  assert_contains_text "Data Flow" "Data flows documented"
  
  echo "========================================"
  echo "Tests Passed: $PASSED"
  echo "Tests Failed: $FAILED"
  
  if [[ $FAILED -gt 0 ]]; then
    exit 1
  fi
}

cd "$(dirname "$DOC_FILE")"
test_architecture_doc
