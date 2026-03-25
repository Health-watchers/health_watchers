#!/bin/bash
# Pre-commit hook to prevent accidental secret commits
# Install: cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# List of patterns that indicate secrets
PATTERNS=(
  "password\s*[:=]\s*['\"]"
  "secret\s*[:=]\s*['\"]"
  "api[_-]?key\s*[:=]\s*['\"]"
  "token\s*[:=]\s*['\"]"
  "credential\s*[:=]\s*['\"]"
  "private[_-]?key"
  "BEGIN RSA PRIVATE KEY"
  "BEGIN PRIVATE KEY"
  "BEGIN OPENSSH PRIVATE KEY"
  "mongodb://[^/]*:[^@]*@"
  "postgresql://[^/]*:[^@]*@"
  "Authorization:\s*Bearer\s+[A-Za-z0-9._-]+"
  "X-API-Key:\s*[A-Za-z0-9._-]+"
  "aws_access_key_id\s*[:=]"
  "aws_secret_access_key\s*[:=]"
)

# Files to exclude from checking
EXCLUDE_PATTERNS=(
  ".env.example"
  "SECURITY.md"
  "scripts/setup-hooks.sh"
  ".gitignore"
)

check_file() {
  local file="$1"
  
  # Skip excluded files
  for exclude in "${EXCLUDE_PATTERNS[@]}"; do
    if [[ "$file" == *"$exclude"* ]]; then
      return 0
    fi
  done
  
  # Skip deleted files
  if [[ ! -f "$file" ]]; then
    return 0
  fi
  
  # Skip binary files
  if file -i "$file" | grep -q "binary"; then
    return 0
  fi
  
  # Check for secret patterns in staged content
  for pattern in "${PATTERNS[@]}"; do
    if git diff --cached "$file" | grep -iE "$pattern"; then
      echo -e "${RED}❌ SECURITY ERROR in $file:${NC}"
      echo "   Found potential secret matching pattern: $pattern"
      return 1
    fi
  done
  
  return 0
}

main() {
  echo "🔒 Running security pre-commit checks..."
  
  local has_errors=0
  
  # Check all staged files
  while IFS= read -r file; do
    if ! check_file "$file"; then
      has_errors=1
    fi
  done < <(git diff --cached --name-only)
  
  if [[ $has_errors -eq 1 ]]; then
    echo ""
    echo -e "${RED}Commit blocked due to security concerns.${NC}"
    echo ""
    echo "To fix:"
    echo "1. Remove secrets from your code"
    echo "2. Use environment variables instead"
    echo "3. Reference: SECURITY.md"
    echo ""
    echo "If this is a false positive, you can:"
    echo "  - Add the pattern to EXCLUDE_PATTERNS in pre-commit-hook.sh"
    echo "  - Or bypass (not recommended): git commit --no-verify"
    echo ""
    exit 1
  fi
  
  echo -e "${GREEN}✓ No secrets detected${NC}"
  exit 0
}

main "$@"
