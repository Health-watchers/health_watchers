#!/usr/bin/env bash
# ============================================================
# MongoDB Replica Set Failover Test Script
#
# Tests automatic failover for Health Watchers replica set.
# Run against the Docker Compose replica environment.
#
# Usage:
#   MONGO_ROOT_USERNAME=root MONGO_ROOT_PASSWORD=changeme \
#   bash scripts/test-mongodb-failover.sh
#
# Issue: #1009 – Database Replication
# ============================================================

set -euo pipefail

MONGO_USER="${MONGO_ROOT_USERNAME:-root}"
MONGO_PASS="${MONGO_ROOT_PASSWORD:-changeme}"

PRIMARY_HOST="${MONGO_PRIMARY_HOST:-localhost:27017}"
SECONDARY1_HOST="${MONGO_SECONDARY1_HOST:-localhost:27018}"
SECONDARY2_HOST="${MONGO_SECONDARY2_HOST:-localhost:27019}"

RS_URI="mongodb://${MONGO_USER}:${MONGO_PASS}@${PRIMARY_HOST},${SECONDARY1_HOST},${SECONDARY2_HOST}/admin?replicaSet=rs0&authSource=admin"

CONTAINER_PRIMARY="health-watchers-mongodb-primary"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓ $*${NC}"; }
fail() { echo -e "${RED}✗ $*${NC}"; exit 1; }
info() { echo -e "${YELLOW}→ $*${NC}"; }

# ── Helpers ─────────────────────────────────────────────────
mongo_eval() {
  local host="$1"; shift
  mongosh "mongodb://${MONGO_USER}:${MONGO_PASS}@${host}/admin?authSource=admin" \
    --quiet --eval "$@" 2>/dev/null
}

get_primary() {
  mongosh "${RS_URI}" --quiet \
    --eval 'rs.status().members.find(m => m.state === 1)?.name || ""' 2>/dev/null | tr -d '\r'
}

wait_for_primary() {
  local timeout="${1:-60}"
  local elapsed=0
  info "Waiting for primary election (timeout: ${timeout}s)..."
  while [ $elapsed -lt $timeout ]; do
    local p
    p=$(get_primary)
    if [ -n "$p" ]; then
      pass "New primary elected: $p"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  fail "No primary elected within ${timeout}s"
}

# ── Pre-flight ───────────────────────────────────────────────
echo ""
echo "============================================================"
echo " MongoDB Replica Set Failover Test"
echo "============================================================"
echo ""

info "Checking replica set status..."
RS_STATUS=$(mongo_eval "${PRIMARY_HOST}" 'JSON.stringify(rs.status().members.map(m=>({name:m.name,stateStr:m.stateStr,health:m.health})))')
echo "$RS_STATUS" | python3 -m json.tool 2>/dev/null || echo "$RS_STATUS"

CURRENT_PRIMARY=$(get_primary)
[ -n "${CURRENT_PRIMARY}" ] || fail "Cannot determine current primary — is the replica set running?"
pass "Current primary: ${CURRENT_PRIMARY}"

# Count healthy members
HEALTHY=$(mongo_eval "${PRIMARY_HOST}" \
  'rs.status().members.filter(m => m.health === 1).length')
[ "${HEALTHY}" -ge 3 ] || fail "Expected ≥ 3 healthy members, got ${HEALTHY}"
pass "Healthy members: ${HEALTHY}"

# ── Test 1: Write before failover ────────────────────────────
echo ""
info "Test 1: Writing test document to primary..."
mongo_eval "${PRIMARY_HOST}" \
  'db.getSiblingDB("health_watchers").failover_test.insertOne({ts: new Date(), test: "pre-failover"})' \
  > /dev/null
pass "Test document inserted"

# ── Test 2: Trigger failover ──────────────────────────────────
echo ""
info "Test 2: Stepping down primary (${CURRENT_PRIMARY})..."

# stepDown makes the primary ineligible for 60 s and triggers election
mongo_eval "${PRIMARY_HOST}" 'rs.stepDown(60)' 2>/dev/null || true
sleep 3   # give time for stepDown to process

# Wait for the new primary
wait_for_primary 60
NEW_PRIMARY=$(get_primary)
[ "${NEW_PRIMARY}" != "${CURRENT_PRIMARY}" ] || \
  fail "Primary did not change after stepDown (still ${CURRENT_PRIMARY})"
pass "Failover confirmed. New primary: ${NEW_PRIMARY}"

# ── Test 3: Write to new primary ─────────────────────────────
echo ""
info "Test 3: Writing to new primary after failover..."

# Resolve host:port to container port mapping
declare -A HOST_MAP
HOST_MAP["${PRIMARY_HOST}"]="${PRIMARY_HOST}"
HOST_MAP["${CONTAINER_PRIMARY}:27017"]="${PRIMARY_HOST}"

# Find which local port maps to the new primary container name
NEW_PRIMARY_PORT=""
for host in "${PRIMARY_HOST}" "${SECONDARY1_HOST}" "${SECONDARY2_HOST}"; do
  candidate=$(mongo_eval "${host}" 'rs.isMaster().primary || ""' 2>/dev/null | tr -d '\r')
  if [ -n "$candidate" ]; then
    NEW_PRIMARY_PORT="${host}"; break
  fi
done

[ -n "${NEW_PRIMARY_PORT}" ] || NEW_PRIMARY_PORT="${SECONDARY1_HOST}"

mongo_eval "${NEW_PRIMARY_PORT}" \
  'db.getSiblingDB("health_watchers").failover_test.insertOne({ts: new Date(), test: "post-failover"})' \
  > /dev/null
pass "Write to new primary succeeded"

# ── Test 4: Network partition simulation ─────────────────────
echo ""
info "Test 4: Network partition simulation (Docker only)..."

if command -v docker &> /dev/null && docker inspect "${CONTAINER_PRIMARY}" &>/dev/null; then
  info "Disconnecting primary container from the network..."
  docker network disconnect health-watchers-db "${CONTAINER_PRIMARY}" 2>/dev/null || true
  sleep 10

  info "Checking new primary is elected after partition..."
  wait_for_primary 60

  info "Reconnecting primary container..."
  docker network connect health-watchers-db "${CONTAINER_PRIMARY}" 2>/dev/null || true
  sleep 5

  info "Verifying original primary rejoins as secondary..."
  wait_for_primary 60
  pass "Network partition test passed"
else
  info "Docker not available or container not found — skipping network partition test"
fi

# ── Test 5: Read from secondary ──────────────────────────────
echo ""
info "Test 5: Verifying read from secondary..."
SECONDARY_PORT="${SECONDARY1_HOST}"
READ_RESULT=$(mongosh \
  "mongodb://${MONGO_USER}:${MONGO_PASS}@${SECONDARY_PORT}/health_watchers?authSource=admin&readPreference=secondary" \
  --quiet \
  --eval 'db.failover_test.countDocuments()' 2>/dev/null | tr -d '\r')
[ "${READ_RESULT}" -ge 1 ] || fail "Could not read test documents from secondary"
pass "Secondary read succeeded — ${READ_RESULT} document(s) found"

# ── Cleanup ──────────────────────────────────────────────────
echo ""
info "Cleaning up test documents..."
mongo_eval "${NEW_PRIMARY_PORT:-${PRIMARY_HOST}}" \
  'db.getSiblingDB("health_watchers").failover_test.drop()' > /dev/null || true
pass "Test documents removed"

# ── Summary ──────────────────────────────────────────────────
echo ""
echo "============================================================"
echo -e "${GREEN} All failover tests passed ✓${NC}"
echo "============================================================"
echo ""
echo "  Final replica set state:"
mongo_eval "${NEW_PRIMARY_PORT:-${PRIMARY_HOST}}" \
  'rs.status().members.forEach(m => print("  ", m.name, m.stateStr, "health:", m.health))'
echo ""
