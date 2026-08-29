#!/bin/bash
# scripts/cdn/verify-cache-headers.sh
# Post-deploy smoke test: fetch one URL per asset class and assert the expected
# Cache-Control, compression (Content-Encoding), and that the SECOND request is
# served from the edge cache (X-Cache: Hit / CF-Cache-Status: HIT / age > 0).
#
# Usage:
#   verify-cache-headers.sh --base https://app.health-watchers.io [--static-sample /path.js]
#
# Exit 0 if every check passes, 1 otherwise. Safe to run in CI as a gate.

set -euo pipefail

BASE=""
STATIC_SAMPLE=""
FAIL=0

log()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
pass() { echo "  ✅ $*"; }
fail() { echo "  ❌ $*"; FAIL=$((FAIL+1)); }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)          BASE="${2%/}"; shift 2 ;;
    --static-sample) STATIC_SAMPLE="$2"; shift 2 ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done
[[ -n "$BASE" ]] || { echo "--base is required" >&2; exit 1; }

headers() { curl -sS -o /dev/null -D - -H 'Accept-Encoding: br, gzip' "$1" "${@:2}"; }
hval() { grep -i "^$2:" <<<"$1" | head -1 | cut -d: -f2- | tr -d '\r' | xargs; }

# discover a hashed asset if none supplied
if [[ -z "$STATIC_SAMPLE" ]]; then
  STATIC_SAMPLE=$(curl -sS "$BASE" | grep -oE '/_next/static/[^"'"'"']+\.(js|css)' | head -1 || true)
fi

check() {  # name url expect_cc_regex expect_encoding expect_cache_second(bool)
  local name="$1" url="$2" cc_re="$3" enc="$4" want_hit="$5"
  log "$name — $url"
  local h1 h2 cc ce
  h1=$(headers "$url") || { fail "$name: request failed"; return; }
  cc=$(hval "$h1" "cache-control")
  ce=$(hval "$h1" "content-encoding")

  if [[ "$cc" =~ $cc_re ]]; then pass "Cache-Control: $cc"; else fail "$name: Cache-Control '$cc' !~ /$cc_re/"; fi

  if [[ -n "$enc" ]]; then
    if [[ "$ce" == "br" || "$ce" == "gzip" ]]; then pass "Content-Encoding: $ce"; else fail "$name: not compressed (Content-Encoding: '${ce:-none}')"; fi
  fi

  if [[ "$want_hit" == "true" ]]; then
    sleep 1
    h2=$(headers "$url")
    local xcache cfstatus age
    xcache=$(hval "$h2" "x-cache")
    cfstatus=$(hval "$h2" "cf-cache-status")
    age=$(hval "$h2" "age")
    if [[ "$xcache" == *Hit* || "$cfstatus" == "HIT" || "${age:-0}" -gt 0 ]]; then
      pass "second request served from edge (x-cache='$xcache' cf='$cfstatus' age='${age:-0}')"
    else
      fail "$name: second request was not a cache hit (x-cache='$xcache' cf='$cfstatus' age='${age:-0}')"
    fi
  fi
}

if [[ -n "$STATIC_SAMPLE" ]]; then
  check "immutable asset" "$BASE$STATIC_SAMPLE" 'max-age=31536000.*immutable' "br" "true"
else
  fail "could not find a /_next/static/ asset to sample (pass --static-sample)"
fi

check "marketing HTML" "$BASE/" 'public.*(s-maxage|max-age)' "br" "true"
check "reference API"   "$BASE/api/v1/icd10?query=cholera" 's-maxage=300' "" "false"
check "PHI API no-store" "$BASE/api/v1/patients" 'no-store' "" "false"

# security headers on an edge response
log "security headers"
sec=$(headers "$BASE/")
[[ "$(hval "$sec" "strict-transport-security")" == *max-age=* ]] && pass "HSTS present" || fail "HSTS missing"
[[ "$(hval "$sec" "x-content-type-options")" == "nosniff" ]] && pass "X-Content-Type-Options: nosniff" || fail "X-Content-Type-Options missing"

echo
if (( FAIL > 0 )); then
  echo "❌ cache header verification: $FAIL failure(s)"
  exit 1
fi
echo "✅ cache header verification passed"
