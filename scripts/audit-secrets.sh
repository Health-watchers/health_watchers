#!/bin/bash
# Audit script to check for hardcoded secrets in the codebase
# Usage: bash scripts/audit-secrets.sh

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# Patterns to search for
declare -A PATTERNS=(
  ["hardcoded_password"]="password\s*[:=]\s*['\"][^'\"]*['\"]"
  ["hardcoded_secret"]="secret\s*[:=]\s*['\"][^'\"]*['\"]"
  ["hardcoded_api_key"]="api[_-]?key\s*[:=]\s*['\"][^'\"]*['\"]"
  ["hardcoded_token"]="token\s*[:=]\s*['\"][^'\"]*['\"]"
  ["hardcoded_db_uri"]="mongodb://[A-Za-z0-9_:-]*@"
  ["hardcoded_jwt"]="jwt[_-]?secret\s*[:=]\s*['\"][^'\"]*['\"]"
  ["aws_credentials"]="aws[_-]?access[_-]?key"
  ["private_key_begin"]="BEGIN.*PRIVATE KEY"
)

# Files to exclude
EXCLUDE_DIRS=(
  "node_modules"
  ".git"
  "dist"
  "build"
  ".next"
  ".turbo"
  "coverage"
)

# Build exclude pattern for grep
BUILD_EXCLUDE=""
for dir in "${EXCLUDE_DIRS[@]}"; do
  BUILD_EXCLUDE="$BUILD_EXCLUDE --exclude-dir=$dir"
done

echo "🔍 Auditing codebase for hardcoded secrets..."
echo ""

FOUND_ISSUES=0

for pattern_name in "${!PATTERNS[@]}"; do
  pattern="${PATTERNS[$pattern_name]}"
  
  results=$(grep -r -i -E "$pattern" \
    $BUILD_EXCLUDE \
    --include="*.ts" \
    --include="*.js" \
    --include="*.tsx" \
    --include="*.jsx" \
    --include="*.env" \
    --include="*.yml" \
    --include="*.yaml" \
    . 2>/dev/null || true)
  
  if [[ ! -z "$results" ]]; then
    # Filter out .env.example and SECURITY.md
    filtered=$(echo "$results" | grep -v ".env.example" | grep -v "SECURITY.md" || true)
    
    if [[ ! -z "$filtered" ]]; then
      echo -e "${RED}❌ $pattern_name${NC}"
      echo "$filtered" | head -5
      echo ""
      FOUND_ISSUES=$((FOUND_ISSUES + 1))
    fi
  fi
done

if [[ $FOUND_ISSUES -gt 0 ]]; then
  echo -e "${RED}Found $FOUND_ISSUES potential security issues!${NC}"
  echo ""
  echo "Remediation:"
  echo "1. Move secrets to environment variables"
  echo "2. Use .env files (added to .gitignore)"
  echo "3. Reference SECURITY.md for best practices"
  echo ""
  exit 1
else
  echo -e "${GREEN}✓ No obvious hardcoded secrets found${NC}"
  echo ""
  echo "⚠ Note: This is a basic audit. Comprehensive scanning should use:"
  echo "  - TruffleHog (https://github.com/trufflesecurity/trufflehog)"
  echo "  - GitGuardian (https://www.gitguardian.com/)"
  echo "  - git-secrets (https://github.com/awslabs/git-secrets)"
fi
