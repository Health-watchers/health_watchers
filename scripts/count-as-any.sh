#!/usr/bin/env bash
# ── #1801 as-any baseline enforcement ─────────────────────────────────────────
#
# Counts "as any" occurrences in non-test production TypeScript files and fails
# the build if the count has gone up since the last recorded baseline.
#
# The baseline is stored in scripts/as-any-baseline.txt as a single integer.
# When the count goes DOWN the baseline is automatically updated so the number
# can only ever decrease.
#
# Usage:
#   node scripts/count-as-any.mjs          # check + auto-update baseline
#   node scripts/count-as-any.mjs --check  # check only (CI mode — no writes)
#
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BASELINE_FILE="$ROOT_DIR/scripts/as-any-baseline.txt"
CHECK_ONLY="${1:-}"

# Directories to scan for production code
DIRS=(
  "apps/api/src"
  "apps/web/src"
  "apps/stellar-service/src"
)

# Build a list of non-test .ts/.tsx files, excluding:
#   - test/spec files (*.test.ts, *.spec.ts, *.test.tsx, *.spec.tsx)
#   - __tests__/, __mocks__/, test/, tests/ directories
#   - node_modules, dist, build, coverage, .next
#   - .d.ts declaration files
count_as_any=0

for dir in "${DIRS[@]}"; do
  full_dir="$ROOT_DIR/$dir"
  [ -d "$full_dir" ] || continue

  while IFS= read -r -d '' file; do
    # Count lines containing "as any" (case-sensitive)
    n=$(grep -c 'as any' "$file" 2>/dev/null || true)
    count_as_any=$((count_as_any + n))
  done < <(find "$full_dir" -type f \( -name '*.ts' -o -name '*.tsx' \) \
    ! -name '*.d.ts' \
    ! -path '*/__tests__/*' \
    ! -path '*/__mocks__/*' \
    ! -path '*/test/*' \
    ! -path '*/tests/*' \
    ! -path '*/node_modules/*' \
    ! -path '*/dist/*' \
    ! -path '*/build/*' \
    ! -path '*/coverage/*' \
    ! -path '*/.next/*' \
    ! -name '*.test.ts' \
    ! -name '*.test.tsx' \
    ! -name '*.spec.ts' \
    ! -name '*.spec.tsx' \
    -print0)
done

# Read the baseline
if [ -f "$BASELINE_FILE" ]; then
  baseline=$(cat "$BASELINE_FILE" | tr -d '[:space:]')
else
  baseline=0
fi

echo "as-any count: $count_as_any (baseline: $baseline)"

if [ "$count_as_any" -gt "$baseline" ]; then
  echo ""
  echo "❌ as-any count increased from $baseline to $count_as_any"
  echo "   New 'as any' casts are not allowed in production code."
  echo "   Fix the new casts or update the baseline in scripts/as-any-baseline.txt"
  echo "   only if the increase is justified and reviewed."
  exit 1
fi

if [ "$count_as_any" -lt "$baseline" ]; then
  echo "✅ as-any count decreased from $baseline to $count_as_any"
  if [ "$CHECK_ONLY" != "--check" ]; then
    echo "$count_as_any" > "$BASELINE_FILE"
    echo "   Baseline updated to $count_as_any"
  else
    echo "   (run without --check to auto-update the baseline)"
  fi
else
  echo "✅ as-any count unchanged at $baseline"
fi
