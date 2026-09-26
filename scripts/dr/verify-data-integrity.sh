#!/bin/bash
# scripts/dr/verify-data-integrity.sh
# Verify the integrity of a MongoDB dataset after a restore (or nightly against
# production). Checks counts vs baseline, referential integrity, schema marker,
# a deterministic checksum over immutable history, and expected indexes.
#
# Usage:
#   verify-data-integrity.sh --uri "mongodb://host/health_watchers" \
#       [--baseline baseline.json] [--tolerance 0.02] [--write-baseline]
#
# Exit 0 = all checks pass, 1 = one or more failures.

set -euo pipefail

URI=""
DB="${DB:-health_watchers}"
BASELINE="${BASELINE:-/tmp/dr-integrity-baseline.json}"
TOLERANCE="0.02"
WRITE_BASELINE=false
REPORT="${REPORT:-/tmp/dr-integrity-report.json}"
METRICS_FILE="${METRICS_FILE:-/tmp/dr_integrity_metrics.txt}"

log()     { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
ok()      { echo "  ✅ $*"; }
bad()     { echo "  ❌ $*"; FAILURES=$((FAILURES+1)); }
FAILURES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uri)             URI="$2"; shift 2 ;;
    --db)              DB="$2"; shift 2 ;;
    --baseline)        BASELINE="$2"; shift 2 ;;
    --tolerance)       TOLERANCE="$2"; shift 2 ;;
    --write-baseline)  WRITE_BASELINE=true; shift ;;
    --report)          REPORT="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done
[[ -n "$URI" ]] || { echo "--uri is required" >&2; exit 1; }

m() { mongosh "$URI" --quiet --eval "$1"; }

COLLECTIONS=(patients encounters invoices attachments users clinics appointments audit_logs)

# ── 1. counts vs baseline ──────────────────────────────────────────────────
declare -A COUNTS
for c in "${COLLECTIONS[@]}"; do
  COUNTS[$c]=$(m "db.getSiblingDB('$DB').${c}.estimatedDocumentCount()" 2>/dev/null || echo 0)
done

if $WRITE_BASELINE; then
  {
    echo "{"
    n=0
    for c in "${COLLECTIONS[@]}"; do
      n=$((n+1)); comma=$([ $n -lt ${#COLLECTIONS[@]} ] && echo , || echo "")
      printf '  "%s": %s%s\n' "$c" "${COUNTS[$c]}" "$comma"
    done
    echo "}"
  } > "$BASELINE"
  log "baseline written to $BASELINE"
fi

log "1. Document counts vs baseline (tolerance ${TOLERANCE})"
if [[ -f "$BASELINE" ]]; then
  for c in "${COLLECTIONS[@]}"; do
    base=$(jq -r --arg k "$c" '.[$k] // 0' "$BASELINE")
    cur=${COUNTS[$c]}
    if [[ "$base" -eq 0 ]]; then ok "$c: $cur (no baseline)"; continue; fi
    lo=$(echo "$base * (1 - $TOLERANCE)" | bc -l | cut -d. -f1)
    if (( cur >= lo )); then ok "$c: $cur (baseline $base)"; else bad "$c: $cur < $lo (baseline $base)"; fi
  done
else
  log "  (no baseline file — skipping, run with --write-baseline first)"
fi

# ── 2. referential integrity ───────────────────────────────────────────────
log "2. Referential integrity"
orphan_encounters=$(m "db.getSiblingDB('$DB').encounters.countDocuments({ patientId: { \$nin: db.getSiblingDB('$DB').patients.distinct('_id') } })" 2>/dev/null || echo -1)
orphan_invoices=$(m "db.getSiblingDB('$DB').invoices.countDocuments({ encounterId: { \$nin: db.getSiblingDB('$DB').encounters.distinct('_id') } })" 2>/dev/null || echo -1)
orphan_attach=$(m "db.getSiblingDB('$DB').attachments.countDocuments({ ownerId: { \$exists: true, \$eq: null } })" 2>/dev/null || echo -1)
(( orphan_encounters == 0 )) && ok "no orphan encounters" || bad "orphan encounters: $orphan_encounters"
(( orphan_invoices == 0 )) && ok "no orphan invoices" || bad "orphan invoices: $orphan_invoices"
(( orphan_attach == 0 )) && ok "no null-owner attachments" || bad "null-owner attachments: $orphan_attach"

# ── 3. schema version marker ───────────────────────────────────────────────
log "3. Schema version marker"
schema_version=$(m "db.getSiblingDB('$DB').meta.findOne({ _id: 'schemaVersion' })?.value || 'missing'" 2>/dev/null || echo missing)
if [[ "$schema_version" != "missing" ]]; then ok "schemaVersion = $schema_version"; else bad "schemaVersion marker missing"; fi

# ── 4. deterministic checksum over immutable history ────────────────────────
log "4. Checksum over immutable audit_logs (pre-cutoff, ordered)"
checksum=$(m "
  const cur = db.getSiblingDB('$DB').audit_logs.find(
    { createdAt: { \$lt: new Date(Date.now() - 7*24*3600*1000) } },
    { _id: 1, action: 1, actorId: 1, createdAt: 1 }
  ).sort({ _id: 1 }).limit(50000).toArray();
  const s = cur.map(d => [d._id, d.action, d.actorId, d.createdAt && d.createdAt.toISOString()].join('|')).join('\n');
  const h = require('crypto').createHash('sha256').update(s).digest('hex');
  print(h + ' ' + cur.length);
" 2>/dev/null || echo "error 0")
log "  checksum: $checksum"
if [[ -f "$BASELINE.checksum" ]]; then
  if [[ "$(cat "$BASELINE.checksum")" == "$checksum" ]]; then ok "history checksum matches baseline"; else bad "history checksum MISMATCH vs baseline"; fi
elif $WRITE_BASELINE; then
  echo "$checksum" > "$BASELINE.checksum"; ok "history checksum baseline written"
else
  log "  (no checksum baseline — skipping comparison)"
fi

# ── 5. expected indexes ────────────────────────────────────────────────────
log "5. Expected indexes present"
for spec in "patients:email_1" "encounters:patientId_1" "invoices:encounterId_1" "users:email_1" "audit_logs:createdAt_1"; do
  coll="${spec%%:*}"; idx="${spec##*:}"
  has=$(m "db.getSiblingDB('$DB').${coll}.getIndexes().some(i => i.name === '$idx')" 2>/dev/null || echo false)
  [[ "$has" == "true" ]] && ok "$coll has index $idx" || bad "$coll missing index $idx"
done

# ── report + metrics ───────────────────────────────────────────────────────
{
  echo "{"
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"db\": \"$DB\","
  echo "  \"failures\": $FAILURES,"
  echo "  \"counts\": {"
  n=0
  for c in "${COLLECTIONS[@]}"; do
    n=$((n+1)); comma=$([ $n -lt ${#COLLECTIONS[@]} ] && echo , || echo "")
    printf '    "%s": %s%s\n' "$c" "${COUNTS[$c]}" "$comma"
  done
  echo "  }"
  echo "}"
} > "$REPORT"

{
  echo "# HELP dr_data_integrity_failures Number of failed integrity checks"
  echo "# TYPE dr_data_integrity_failures gauge"
  echo "dr_data_integrity_failures{db=\"$DB\"} $FAILURES"
  echo "dr_data_integrity_check_timestamp_seconds{db=\"$DB\"} $(date +%s)"
} > "$METRICS_FILE"

echo
if (( FAILURES > 0 )); then
  echo "❌ data integrity: $FAILURES failure(s) — report: $REPORT"
  exit 1
fi
echo "✅ data integrity: all checks passed — report: $REPORT"
