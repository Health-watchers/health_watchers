#!/bin/bash
# Dependency Vulnerability Scanner
# Issue #1051 - Dependency Vulnerability Scanning
#
# This script scans all workspace dependencies for known vulnerabilities
# using npm audit and generates comprehensive reports.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPORT_DIR="./security-reports/dependency-scans"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
WORKSPACES=(
  "apps/api"
  "apps/web"
  "apps/mobile"
  "apps/stellar-service"
  "packages/anonymize"
  "packages/config"
  "packages/types"
)

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Dependency Vulnerability Scanner${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Create report directory
mkdir -p "$REPORT_DIR"

# Function to print section headers
print_header() {
  echo ""
  echo -e "${BLUE}>>> $1${NC}"
  echo ""
}

# Function to scan a workspace
scan_workspace() {
  local workspace=$1
  local workspace_name=$(echo "$workspace" | tr '/' '-')
  
  print_header "Scanning: $workspace"
  
  if [ ! -d "$workspace" ]; then
    echo -e "${YELLOW}⚠ Workspace not found: $workspace${NC}"
    return
  fi
  
  cd "$workspace"
  
  # Check if package.json exists
  if [ ! -f "package.json" ]; then
    echo -e "${YELLOW}⚠ No package.json found in $workspace${NC}"
    cd - > /dev/null
    return
  fi
  
  # Install dependencies if node_modules doesn't exist
  if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm ci --quiet || npm install --quiet
  fi
  
  # Run npm audit
  echo "Running npm audit..."
  local audit_file="../../$REPORT_DIR/npm-audit-${workspace_name}-${TIMESTAMP}.json"
  local audit_txt="../../$REPORT_DIR/npm-audit-${workspace_name}-${TIMESTAMP}.txt"
  
  npm audit --json > "$audit_file" 2>&1 || true
  npm audit > "$audit_txt" 2>&1 || true
  
  # Parse and display results
  if command -v jq &> /dev/null; then
    local critical=$(jq -r '.metadata.vulnerabilities.critical // 0' "$audit_file")
    local high=$(jq -r '.metadata.vulnerabilities.high // 0' "$audit_file")
    local moderate=$(jq -r '.metadata.vulnerabilities.moderate // 0' "$audit_file")
    local low=$(jq -r '.metadata.vulnerabilities.low // 0' "$audit_file")
    local info=$(jq -r '.metadata.vulnerabilities.info // 0' "$audit_file")
    
    echo ""
    echo "Vulnerability Summary:"
    [ "$critical" -gt 0 ] && echo -e "${RED}  Critical: $critical${NC}" || echo -e "  Critical: $critical"
    [ "$high" -gt 0 ] && echo -e "${RED}  High: $high${NC}" || echo -e "  High: $high"
    [ "$moderate" -gt 0 ] && echo -e "${YELLOW}  Moderate: $moderate${NC}" || echo -e "  Moderate: $moderate"
    echo -e "  Low: $low"
    echo -e "  Info: $info"
    
    # Track overall status
    if [ "$critical" -gt 0 ] || [ "$high" -gt 0 ]; then
      HAS_CRITICAL_VULNS=true
    fi
  else
    echo -e "${YELLOW}⚠ jq not installed. Install jq for detailed vulnerability summary.${NC}"
  fi
  
  cd - > /dev/null
}

# Main execution
HAS_CRITICAL_VULNS=false

print_header "Starting vulnerability scans for all workspaces"

for workspace in "${WORKSPACES[@]}"; do
  scan_workspace "$workspace"
done

# Root-level scan
print_header "Scanning: root workspace"
npm audit --json > "$REPORT_DIR/npm-audit-root-${TIMESTAMP}.json" 2>&1 || true
npm audit > "$REPORT_DIR/npm-audit-root-${TIMESTAMP}.txt" 2>&1 || true

if command -v jq &> /dev/null; then
  critical=$(jq -r '.metadata.vulnerabilities.critical // 0' "$REPORT_DIR/npm-audit-root-${TIMESTAMP}.json")
  high=$(jq -r '.metadata.vulnerabilities.high // 0' "$REPORT_DIR/npm-audit-root-${TIMESTAMP}.json")
  moderate=$(jq -r '.metadata.vulnerabilities.moderate // 0' "$REPORT_DIR/npm-audit-root-${TIMESTAMP}.json")
  low=$(jq -r '.metadata.vulnerabilities.low // 0' "$REPORT_DIR/npm-audit-root-${TIMESTAMP}.json")
  
  echo ""
  echo "Root Vulnerability Summary:"
  [ "$critical" -gt 0 ] && echo -e "${RED}  Critical: $critical${NC}" || echo -e "  Critical: $critical"
  [ "$high" -gt 0 ] && echo -e "${RED}  High: $high${NC}" || echo -e "  High: $high"
  [ "$moderate" -gt 0 ] && echo -e "${YELLOW}  Moderate: $moderate${NC}" || echo -e "  Moderate: $moderate"
  echo -e "  Low: $low"
  
  if [ "$critical" -gt 0 ] || [ "$high" -gt 0 ]; then
    HAS_CRITICAL_VULNS=true
  fi
fi

# Generate summary report
print_header "Generating consolidated report"

SUMMARY_FILE="$REPORT_DIR/scan-summary-${TIMESTAMP}.md"

cat > "$SUMMARY_FILE" << EOF
# Dependency Vulnerability Scan Summary

**Scan Date**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

## Overview

This report consolidates vulnerability findings from npm audit across all workspaces.

## Scan Configuration

- **Scanner**: npm audit
- **Workspaces Scanned**: ${#WORKSPACES[@]} + root
- **Report Location**: \`$REPORT_DIR\`

## Workspace Results

EOF

for workspace in "${WORKSPACES[@]}" "root"; do
  workspace_name=$(echo "$workspace" | tr '/' '-')
  audit_file="$REPORT_DIR/npm-audit-${workspace_name}-${TIMESTAMP}.json"
  
  if [ -f "$audit_file" ] && command -v jq &> /dev/null; then
    critical=$(jq -r '.metadata.vulnerabilities.critical // 0' "$audit_file")
    high=$(jq -r '.metadata.vulnerabilities.high // 0' "$audit_file")
    moderate=$(jq -r '.metadata.vulnerabilities.moderate // 0' "$audit_file")
    low=$(jq -r '.metadata.vulnerabilities.low // 0' "$audit_file")
    
    cat >> "$SUMMARY_FILE" << EOF

### $workspace

| Severity | Count |
|----------|-------|
| Critical | $critical |
| High     | $high |
| Moderate | $moderate |
| Low      | $low |

EOF
  fi
done

cat >> "$SUMMARY_FILE" << EOF

## Recommendations

1. **Immediate Action Required**: Address all critical and high-severity vulnerabilities
2. **Update Dependencies**: Run \`npm audit fix\` in affected workspaces
3. **Manual Review**: Some vulnerabilities may require manual dependency updates
4. **Track Progress**: Use the vulnerability tracking system to monitor remediation

## Detailed Reports

Individual JSON and text reports are available in:
\`$REPORT_DIR\`

EOF

echo -e "${GREEN}✓ Summary report generated: $SUMMARY_FILE${NC}"

# Final status
echo ""
echo -e "${BLUE}========================================${NC}"
if [ "$HAS_CRITICAL_VULNS" = true ]; then
  echo -e "${RED}⚠ CRITICAL or HIGH severity vulnerabilities detected!${NC}"
  echo -e "${YELLOW}Review the reports and address vulnerabilities immediately.${NC}"
  exit 1
else
  echo -e "${GREEN}✓ Scan complete. No critical or high-severity vulnerabilities detected.${NC}"
fi
echo -e "${BLUE}========================================${NC}"
