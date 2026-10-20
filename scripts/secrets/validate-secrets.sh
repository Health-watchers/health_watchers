#!/bin/bash
# scripts/secrets/validate-secrets.sh
# Pre-deploy validation of Health Watchers secrets.
#
# Checks presence, format, strength, freshness, absence of placeholders, and
# (optionally) that the store value digest matches the projected Kubernetes
# Secret. Exits non-zero on any failure so it can gate a deploy.
#
# Usage:
#   validate-secrets.sh --env <env> --store <aws|vault> [--k8s-check] [--json]
#
# Never prints secret values — only key names and pass/fail.
# Requires: jq, yq, openssl; aws-cli or vault; kubectl (only with --k8s-check).

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
POLICY_FILE="${POLICY_FILE:-$ROOT/ops/secrets/rotation-policy.yaml}"
ENVIRONMENT=""
STORE="aws"
K8S_CHECK=false
JSON=false
AWS_REGION="${AWS_REGION:-us-east-1}"
K8S_NAMESPACE="${K8S_NAMESPACE:-health-watchers}"
K8S_SECRET="${K8S_SECRET:-health-watchers-secrets}"

PASS=0; FAIL=0
declare -a RESULTS

log()   { $JSON || echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
ok()    { PASS=$((PASS+1)); RESULTS+=("PASS $*"); $JSON || echo "  ✅ $*"; }
bad()   { FAIL=$((FAIL+1)); RESULTS+=("FAIL $*"); $JSON || echo "  ❌ $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)       ENVIRONMENT="$2"; shift 2 ;;
    --store)     STORE="$2"; shift 2 ;;
    --k8s-check) K8S_CHECK=true; shift ;;
    --json)      JSON=true; shift ;;
    -h|--help)   sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done
[[ -n "$ENVIRONMENT" ]] || { echo "--env is required" >&2; exit 1; }

# Shannon entropy in bits/char of stdin.
entropy_per_char() {
  python3 - <<'PY'
import sys, math, collections
d = sys.stdin.buffer.read()
if not d:
    print("0"); sys.exit()
c = collections.Counter(d)
n = len(d)
h = -sum((v/n) * math.log2(v/n) for v in c.values())
print(f"{h:.2f}")
PY
}

get_value() {
  local name="$1"
  if [[ "$STORE" == "aws" ]]; then
    aws secretsmanager get-secret-value \
      --secret-id "health-watchers/${ENVIRONMENT}/${name}" \
      --region "$AWS_REGION" --query 'SecretString' --output text 2>/dev/null || true
  else
    vault kv get -field=value "secret/health-watchers/${ENVIRONMENT}/${name}" 2>/dev/null || true
  fi
}

age_days() {
  local name="$1" ts epoch
  if [[ "$STORE" == "aws" ]]; then
    ts="$(aws secretsmanager describe-secret --secret-id "health-watchers/${ENVIRONMENT}/${name}" \
      --region "$AWS_REGION" --query 'LastChangedDate' --output text 2>/dev/null || echo '')"
  else
    ts="$(vault kv metadata get -format=json "secret/health-watchers/${ENVIRONMENT}/${name}" 2>/dev/null \
      | jq -r '.data.updated_time // empty')"
  fi
  [[ -n "$ts" && "$ts" != "None" ]] || { echo -1; return; }
  epoch="$(date -d "$ts" +%s 2>/dev/null || echo 0)"
  echo $(( ($(date +%s) - epoch) / 86400 ))
}

MIN_ENTROPY="$(yq -r '.defaults.minEntropyBitsPerChar' "$POLICY_FILE")"
DEFAULT_GRACE="$(yq -r '.defaults.graceDays' "$POLICY_FILE")"
mapfile -t PLACEHOLDERS < <(yq -r '.defaults.placeholderPatterns[]' "$POLICY_FILE")

log "Validating secrets for env=$ENVIRONMENT store=$STORE"

while read -r name; do
  [[ -n "$name" ]] || continue
  log "• $name"
  interval="$(yq -r ".secrets[] | select(.name==\"$name\") | .intervalDays" "$POLICY_FILE")"
  grace="$(yq -r ".secrets[] | select(.name==\"$name\") | (.graceDays // $DEFAULT_GRACE)" "$POLICY_FILE")"
  min_len="$(yq -r ".secrets[] | select(.name==\"$name\") | (.minLength // 16)" "$POLICY_FILE")"
  stype="$(yq -r ".secrets[] | select(.name==\"$name\") | .type" "$POLICY_FILE")"

  value="$(get_value "$name")"

  # presence
  if [[ -z "$value" ]]; then bad "$name: MISSING from $STORE"; continue; fi
  ok "$name: present"

  # placeholder
  ph_hit=false
  for p in "${PLACEHOLDERS[@]}"; do
    if echo "$value" | grep -qiE "$p"; then ph_hit=true; break; fi
  done
  $ph_hit && bad "$name: contains a placeholder pattern" || ok "$name: no placeholder"

  # whitespace / quoting
  if [[ "$value" =~ ^[[:space:]] || "$value" =~ [[:space:]]$ || "$value" =~ ^\".*\"$ ]]; then
    bad "$name: leading/trailing whitespace or wrapping quotes"
  else
    ok "$name: clean framing"
  fi

  # length
  if (( ${#value} < min_len )); then
    bad "$name: length ${#value} < required $min_len"
  else
    ok "$name: length ${#value} >= $min_len"
  fi

  # entropy (skip structured credential blobs)
  if [[ "$stype" != "third-party" && "$stype" != "keypair" ]]; then
    e="$(printf '%s' "$value" | entropy_per_char)"
    if (( $(echo "$e < $MIN_ENTROPY" | bc -l) )); then
      bad "$name: entropy ${e} b/char < $MIN_ENTROPY"
    else
      ok "$name: entropy ${e} b/char"
    fi
  fi

  # type-specific format
  case "$stype" in
    db-credential)
      # if it looks like a URI it must parse
      if [[ "$value" == mongodb* ]] && ! [[ "$value" =~ ^mongodb(\+srv)?://[^[:space:]]+$ ]]; then
        bad "$name: not a valid mongodb URI"
      else ok "$name: format ok"; fi ;;
    signing-key|data-key)
      if printf '%s' "$value" | base64 -d >/dev/null 2>&1 || [[ "$value" =~ ^[A-Za-z0-9_-]+$ ]]; then
        ok "$name: format ok"
      else bad "$name: expected base64/urlsafe token"; fi ;;
    *) ok "$name: format check skipped for type=$stype" ;;
  esac

  # freshness
  a="$(age_days "$name")"
  if (( a < 0 )); then
    bad "$name: no rotation timestamp"
  elif (( a > interval + grace )); then
    bad "$name: age ${a}d exceeds ${interval}+${grace}d"
  else
    ok "$name: age ${a}d within policy"
  fi

  # cross-store consistency
  if $K8S_CHECK; then
    upper="$(echo "$name" | tr 'a-z-' 'A-Z_')"
    k8s_val="$(kubectl get secret "$K8S_SECRET" -n "$K8S_NAMESPACE" -o json 2>/dev/null \
      | jq -r --arg k "$upper" '.data[$k] // empty' | base64 -d 2>/dev/null || true)"
    if [[ -z "$k8s_val" ]]; then
      log "  (no projected key $upper — skipping consistency check)"
    elif [[ "$(printf '%s' "$k8s_val" | sha256sum)" == "$(printf '%s' "$value" | sha256sum)" ]]; then
      ok "$name: projected Secret matches store"
    else
      bad "$name: projected Secret STALE vs store (ESO out of sync)"
    fi
  fi

  unset value
done < <(yq -r '.secrets[].name' "$POLICY_FILE")

if $JSON; then
  printf '{"env":"%s","store":"%s","pass":%d,"fail":%d,"results":[' "$ENVIRONMENT" "$STORE" "$PASS" "$FAIL"
  for i in "${!RESULTS[@]}"; do
    [[ $i -gt 0 ]] && printf ','
    printf '"%s"' "${RESULTS[$i]//\"/\\\"}"
  done
  printf ']}\n'
fi

echo
if (( FAIL > 0 )); then
  echo "❌ validation FAILED: $FAIL problem(s), $PASS ok"
  exit 1
fi
echo "✅ validation passed: $PASS checks"
