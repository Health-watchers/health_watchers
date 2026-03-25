#!/bin/bash
# Setup git hooks for the repository
# Usage: bash scripts/setup-hooks.sh

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

echo "📦 Setting up Git hooks..."

# Create hooks directory if it doesn't exist
mkdir -p "$HOOKS_DIR"

# Copy pre-commit hook
if [[ -f "$REPO_ROOT/scripts/pre-commit-hook.sh" ]]; then
  cp "$REPO_ROOT/scripts/pre-commit-hook.sh" "$HOOKS_DIR/pre-commit"
  chmod +x "$HOOKS_DIR/pre-commit"
  echo "✓ Pre-commit hook installed"
else
  echo "⚠ pre-commit-hook.sh not found"
  exit 1
fi

# Copy commit-msg hook for conventional commits
if [[ -f "$REPO_ROOT/scripts/commit-msg-hook.sh" ]]; then
  cp "$REPO_ROOT/scripts/commit-msg-hook.sh" "$HOOKS_DIR/commit-msg"
  chmod +x "$HOOKS_DIR/commit-msg"
  echo "✓ Commit message hook installed"
fi

echo ""
echo "✅ Git hooks setup complete!"
echo ""
echo "Installed hooks:"
echo "  - pre-commit: Prevents accidental secret commits"
echo ""
echo "To remove hooks later, run:"
echo "  rm -rf $HOOKS_DIR/pre-commit"
