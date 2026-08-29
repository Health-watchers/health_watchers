#!/bin/bash

# Setup Git Hooks for Secrets Scanning
# This script installs a pre-commit hook to prevent secrets from being committed

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
PRE_COMMIT_HOOK="$HOOKS_DIR/pre-commit"

echo "🔧 Setting up git hooks for secrets scanning..."

# Create hooks directory if it doesn't exist
mkdir -p "$HOOKS_DIR"

# Create pre-commit hook
cat > "$PRE_COMMIT_HOOK" << 'EOF'
#!/bin/bash
# Pre-commit hook for secrets scanning
# This hook runs gitleaks on staged changes to prevent secrets from being committed

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
TEMP_REPORT="/tmp/gitleaks-precommit-report.json"

echo "🔍 Scanning staged changes for secrets..."

# Run gitleaks on staged changes
docker run --rm \
  -v "$REPO_ROOT:/repo" \
  zricethezav/gitleaks:latest detect \
  --source=/repo \
  --config=/repo/.gitleaks.toml \
  --log-opts="--diff-filter=d --cached" \
  --report-format=json \
  --report-path="$TEMP_REPORT" 2>&1

# Check if secrets were found
if [ -f "$TEMP_REPORT" ]; then
  LEAK_COUNT=$(jq 'length' "$TEMP_REPORT" 2>/dev/null || echo 0)

  if [ "$LEAK_COUNT" -gt 0 ]; then
    echo ""
    echo "❌ Secrets detected in staged changes!"
    echo ""
    echo "Found $LEAK_COUNT potential secret(s):"
    echo ""
    jq -r '.[] | "  \(.File):\(.StartLine) - \(.Description) (\(.Match))"' "$LEAK_REPORT" 2>/dev/null || true
    echo ""
    echo "⚠️  Please review the findings:"
    echo "  1. For real secrets: remove them and rotate the secret"
    echo "  2. For false positives: add to .gitleaks.toml allowlist"
    echo ""
    echo "Learn more: https://github.com/Health-watchers/health_watchers/blob/main/SECURITY_SECRETS_REMEDIATION.md"
    echo ""
    rm -f "$TEMP_REPORT"
    exit 1
  fi

  rm -f "$TEMP_REPORT"
fi

echo "✅ No secrets detected in staged changes"
exit 0
EOF

# Make the hook executable
chmod +x "$PRE_COMMIT_HOOK"

echo "✅ Pre-commit hook installed at: $PRE_COMMIT_HOOK"
echo ""
echo "The hook will now scan for secrets before each commit."
echo "To test it, try committing: git commit -m 'test'"
echo ""
echo "If you need to bypass the hook (use with caution):"
echo "  git commit --no-verify"
echo ""
