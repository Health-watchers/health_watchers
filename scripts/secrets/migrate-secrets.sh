#!/bin/bash
# scripts/secrets/migrate-secrets.sh
# Import secrets into the authoritative store, or move them between stores.
#
# Sources:  --source <file.env | k8s | aws | vault>
# Targets:  --target <aws | vault>
#
# Usage:
#   migrate-secrets.sh --source .env.production --target aws   --env production --dry-run
#   migrate-secrets.sh --source k8s            --target vault  --env staging
#   migrate-secrets.sh --source vault          --target aws    --env production
#
# Every write is tagged with migratedAt / migratedBy. Prints KEYS ONLY.
# Requires: jq, yq; aws-cli and/or vault; kubectl (for --source k8s).

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
POLICY_FILE="${POLICY_FILE:-$ROOT/ops/secrets/rotation-policy.yaml}"
SOURCE=""
TARGET=""
ENVIRONMENT=""
DRY_RUN=false
AWS_REGION="${AWS_REGION:-us-east-1}"
K8S_NAMESPACE="${K8S_NAMESPACE:-health-watchers}"
K8S_SECRET="${K8S_SECRET:-health-watchers-secrets}"
ONLY=""

log()     { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
error()   { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ❌ ERROR: $*" >&2; }
success() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✅ $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)  SOURCE="$2"; shift 2 ;;
    --target)  TARGET="$2"; shift 2 ;;
    --env)     ENVIRONMENT="$2"; shift 2 ;;
    --only)    ONLY="$2"; shift 2 ;;          # comma-separated allow-list
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) error "unknown arg: $1"; exit 1 ;;
  esac
done

[[ -n "$SOURCE" && -n "$TARGET" && -n "$ENVIRONMENT" ]] || {
  error "--source, --target and --env are all required"; exit 1; }
[[ "$TARGET" == "aws" || "$TARGET" == "vault" ]] || { error "--target must be aws|vault"; exit 1; }

MANAGED_KEYS="$(yq -r '.secrets[].name' "$POLICY_FILE")"

is_managed() { grep -qx "$1" <<< "$MANAGED_KEYS"; }
in_allow_list() { [[ -z "$ONLY" ]] || [[ ",$ONLY," == *",$1,"* ]]; }

# Normalise an env-style KEY into a policy secret name (JWT_SECRET -> jwt-secret).
to_secret_name() { echo "$1" | tr 'A-Z_' 'a-z-'; }

# --- collect source pairs into a temp file: "name<TAB>value" -----------------
WORK="$(mktemp)"; trap 'rm -f "$WORK"' EXIT

case "$SOURCE" in
  k8s)
    kubectl get secret "$K8S_SECRET" -n "$K8S_NAMESPACE" -o json \
      | jq -r '.data | to_entries[] | "\(.key)\t\(.value)"' \
      | while IFS=$'\t' read -r k v; do
          printf '%s\t%s\n' "$(to_secret_name "$k")" "$(echo "$v" | base64 -d)"
        done > "$WORK"
    ;;
  aws)
    for name in $MANAGED_KEYS; do
      v="$(aws secretsmanager get-secret-value --secret-id "health-watchers/${ENVIRONMENT}/${name}" \
        --region "$AWS_REGION" --query 'SecretString' --output text 2>/dev/null || true)"
      [[ -n "$v" ]] && printf '%s\t%s\n' "$name" "$v" >> "$WORK"
    done
    ;;
  vault)
    for name in $MANAGED_KEYS; do
      v="$(vault kv get -field=value "secret/health-watchers/${ENVIRONMENT}/${name}" 2>/dev/null || true)"
      [[ -n "$v" ]] && printf '%s\t%s\n' "$name" "$v" >> "$WORK"
    done
    ;;
  *)
    [[ -f "$SOURCE" ]] || { error "source file not found: $SOURCE"; exit 1; }
    # parse KEY=VALUE, ignore comments/blank, strip optional surrounding quotes
    grep -vE '^\s*(#|$)' "$SOURCE" | while IFS='=' read -r k rest; do
      k="$(echo "$k" | xargs)"
      v="${rest%$'\r'}"
      v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
      printf '%s\t%s\n' "$(to_secret_name "$k")" "$v"
    done > "$WORK"
    ;;
esac

TOTAL=0; WRITTEN=0; SKIPPED=0
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
WHO="${USER:-ci}@migrate-secrets.sh"

while IFS=$'\t' read -r name value; do
  [[ -n "$name" ]] || continue
  TOTAL=$((TOTAL+1))
  if ! is_managed "$name"; then
    log "skip $name (not in rotation-policy.yaml)"; SKIPPED=$((SKIPPED+1)); continue
  fi
  if ! in_allow_list "$name"; then
    SKIPPED=$((SKIPPED+1)); continue
  fi
  if [[ -z "$value" ]]; then
    log "skip $name (empty source value)"; SKIPPED=$((SKIPPED+1)); continue
  fi

  if $DRY_RUN; then
    log "[dry-run] would write $name -> $TARGET (health-watchers/${ENVIRONMENT}/${name}) [${#value} chars]"
    WRITTEN=$((WRITTEN+1)); unset value; continue
  fi

  if [[ "$TARGET" == "aws" ]]; then
    id="health-watchers/${ENVIRONMENT}/${name}"
    if aws secretsmanager describe-secret --secret-id "$id" --region "$AWS_REGION" >/dev/null 2>&1; then
      aws secretsmanager put-secret-value --secret-id "$id" --region "$AWS_REGION" \
        --secret-string "$value" >/dev/null
    else
      aws secretsmanager create-secret --name "$id" --region "$AWS_REGION" \
        --secret-string "$value" \
        --tags "Key=migratedAt,Value=$NOW" "Key=migratedBy,Value=$WHO" >/dev/null
    fi
    aws secretsmanager tag-resource --secret-id "$id" --region "$AWS_REGION" \
      --tags "Key=migratedAt,Value=$NOW" "Key=migratedBy,Value=$WHO" >/dev/null
  else
    vault kv put "secret/health-watchers/${ENVIRONMENT}/${name}" \
      value="$value" migratedAt="$NOW" migratedBy="$WHO" >/dev/null
  fi
  success "wrote $name -> $TARGET"
  WRITTEN=$((WRITTEN+1))
  unset value
done < "$WORK"

echo
log "source=$SOURCE target=$TARGET env=$ENVIRONMENT"
log "seen=$TOTAL written=$WRITTEN skipped=$SKIPPED $($DRY_RUN && echo '(dry-run)')"
$DRY_RUN && log "re-run without --dry-run to apply, then: scripts/secrets/validate-secrets.sh --env $ENVIRONMENT --store $TARGET"
