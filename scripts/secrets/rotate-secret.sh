#!/bin/bash
# scripts/secrets/rotate-secret.sh
# Rotation orchestration for Health Watchers secrets.
#
# Reads the policy in ops/secrets/rotation-policy.yaml and either reports on
# rotation status or rotates a named secret using the method declared for it.
#
# Usage:
#   rotate-secret.sh --env <env> --store <aws|vault> --secret <name> [--force] [--dry-run]
#   rotate-secret.sh --env <env> --store <aws|vault> --report
#   rotate-secret.sh --env <env> --store <aws|vault> --rollback <name>
#
# Never prints secret values. Requires: aws-cli or vault, jq, yq.

set -euo pipefail

POLICY_FILE="${POLICY_FILE:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)/ops/secrets/rotation-policy.yaml}"
ENVIRONMENT=""
STORE="aws"
SECRET=""
ACTION="rotate"
FORCE=false
DRY_RUN=false
ROLLBACK_TARGET=""
AWS_REGION="${AWS_REGION:-us-east-1}"

log()     { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
error()   { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ❌ ERROR: $*" >&2; }
success() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✅ $*"; }
warn()    { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ⚠️  $*"; }

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)      ENVIRONMENT="$2"; shift 2 ;;
    --store)    STORE="$2"; shift 2 ;;
    --secret)   SECRET="$2"; shift 2 ;;
    --report)   ACTION="report"; shift ;;
    --rollback) ACTION="rollback"; ROLLBACK_TARGET="$2"; shift 2 ;;
    --force)    FORCE=true; shift ;;
    --dry-run)  DRY_RUN=true; shift ;;
    -h|--help)  usage 0 ;;
    *) error "unknown arg: $1"; usage 1 ;;
  esac
done

[[ -n "$ENVIRONMENT" ]] || { error "--env is required"; exit 1; }
[[ -f "$POLICY_FILE" ]] || { error "policy file not found: $POLICY_FILE"; exit 1; }
command -v yq >/dev/null || { error "yq is required"; exit 1; }
command -v jq >/dev/null || { error "jq is required"; exit 1; }

store_path() {
  local name="$1"
  if [[ "$STORE" == "aws" ]]; then
    echo "health-watchers/${ENVIRONMENT}/${name}"
  else
    echo "secret/health-watchers/${ENVIRONMENT}/${name}"
  fi
}

# Age in days of the current version of a secret (0 if unknown).
secret_age_days() {
  local name="$1" path created epoch now
  path="$(store_path "$name")"
  if [[ "$STORE" == "aws" ]]; then
    created="$(aws secretsmanager describe-secret --secret-id "$path" --region "$AWS_REGION" \
      --query 'LastChangedDate' --output text 2>/dev/null || echo '')"
    [[ -n "$created" && "$created" != "None" ]] || { echo 0; return; }
    epoch="$(date -d "$created" +%s 2>/dev/null || echo 0)"
  else
    created="$(vault kv metadata get -format=json "$path" 2>/dev/null \
      | jq -r '.data.updated_time // empty')"
    [[ -n "$created" ]] || { echo 0; return; }
    epoch="$(date -d "$created" +%s 2>/dev/null || echo 0)"
  fi
  now="$(date +%s)"
  echo $(( (now - epoch) / 86400 ))
}

report() {
  local default_grace names name interval grace age status overdue=0
  default_grace="$(yq -r '.defaults.graceDays' "$POLICY_FILE")"
  names="$(yq -r '.secrets[].name' "$POLICY_FILE")"
  printf '%-26s %-10s %-8s %-8s %s\n' "SECRET" "AGE(d)" "LIMIT(d)" "STATUS" "METHOD"
  printf '%-26s %-10s %-8s %-8s %s\n' "──────" "──────" "────────" "──────" "──────"
  while read -r name; do
    [[ -n "$name" ]] || continue
    interval="$(yq -r ".secrets[] | select(.name==\"$name\") | .intervalDays" "$POLICY_FILE")"
    grace="$(yq -r ".secrets[] | select(.name==\"$name\") | (.graceDays // $default_grace)" "$POLICY_FILE")"
    method="$(yq -r ".secrets[] | select(.name==\"$name\") | .method" "$POLICY_FILE")"
    age="$(secret_age_days "$name")"
    if (( age > interval + grace )); then status="OVERDUE"; overdue=$((overdue+1))
    elif (( age > interval )); then status="DUE"
    else status="ok"; fi
    printf '%-26s %-10s %-8s %-8s %s\n' "$name" "$age" "$interval" "$status" "$method"
  done <<< "$names"
  echo
  if (( overdue > 0 )); then
    error "$overdue secret(s) OVERDUE for rotation in env=$ENVIRONMENT"
    return 2
  fi
  success "all secrets within rotation policy for env=$ENVIRONMENT"
}

rotate_aws() {
  local name="$1" path lambda method
  path="$(store_path "$name")"
  method="$(yq -r ".secrets[] | select(.name==\"$name\") | .method" "$POLICY_FILE")"
  lambda="$(yq -r ".secrets[] | select(.name==\"$name\") | (.lambdaArn // \"\")" "$POLICY_FILE")"
  lambda="${lambda//\$\{AWS_REGION\}/$AWS_REGION}"
  lambda="${lambda//\$\{AWS_ACCOUNT_ID\}/${AWS_ACCOUNT_ID:-}}"

  if [[ "$method" == "manual" ]]; then
    warn "$name is a MANUAL rotation — see its runbook. No action taken."
    return 0
  fi
  if $DRY_RUN; then
    log "[dry-run] aws secretsmanager rotate-secret --secret-id $path" \
        "${lambda:+--rotation-lambda-arn $lambda}"
    return 0
  fi
  if [[ -n "$lambda" ]]; then
    aws secretsmanager rotate-secret --secret-id "$path" \
      --rotation-lambda-arn "$lambda" --region "$AWS_REGION" >/dev/null
  else
    aws secretsmanager rotate-secret --secret-id "$path" --region "$AWS_REGION" >/dev/null
  fi
  aws secretsmanager tag-resource --secret-id "$path" --region "$AWS_REGION" \
    --tags "Key=rotatedAt,Value=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
           "Key=rotatedBy,Value=rotate-secret.sh" >/dev/null
  success "rotation triggered for $path"
}

rotate_vault() {
  local name="$1" path method len new
  path="$(store_path "$name")"
  method="$(yq -r ".secrets[] | select(.name==\"$name\") | .method" "$POLICY_FILE")"
  len="$(yq -r ".secrets[] | select(.name==\"$name\") | (.minLength // 32)" "$POLICY_FILE")"

  if [[ "$method" == "manual" ]]; then
    warn "$name is a MANUAL rotation — see its runbook. No action taken."
    return 0
  fi
  if $DRY_RUN; then
    log "[dry-run] generate ${len}-byte value and vault kv put $path value=***"
    return 0
  fi
  new="$(openssl rand -base64 "$((len * 2))" | tr -d '\n/+=' | head -c "$((len * 2))")"
  vault kv put "$path" \
    value="$new" \
    rotatedAt="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    rotatedBy="rotate-secret.sh" >/dev/null
  unset new
  success "new version written for $path"
}

force_resync() {
  kubectl annotate externalsecret health-watchers-secrets -n health-watchers \
    force-sync="$(date +%s)" --overwrite >/dev/null 2>&1 || \
    warn "could not annotate ExternalSecret (not on cluster?) — resync manually"
}

rollback() {
  local name="$1" path
  path="$(store_path "$name")"
  if $DRY_RUN; then log "[dry-run] roll back $path to previous version"; return 0; fi
  if [[ "$STORE" == "aws" ]]; then
    aws secretsmanager update-secret-version-stage --secret-id "$path" --region "$AWS_REGION" \
      --version-stage AWSCURRENT \
      --move-to-version-id "$(aws secretsmanager list-secret-version-ids --secret-id "$path" \
        --region "$AWS_REGION" --query \
        "Versions[?contains(VersionStages, 'AWSPREVIOUS')].VersionId | [0]" --output text)" >/dev/null
  else
    local cur prev
    cur="$(vault kv metadata get -format=json "$path" | jq -r '.data.current_version')"
    prev=$((cur - 1))
    (( prev >= 1 )) || { error "no previous version to roll back to"; exit 1; }
    vault kv rollback -version="$prev" "$path" >/dev/null
  fi
  force_resync
  success "rolled back $path and forced resync"
}

case "$ACTION" in
  report)   report ;;
  rollback) rollback "$ROLLBACK_TARGET" ;;
  rotate)
    [[ -n "$SECRET" ]] || { error "--secret is required for rotation"; exit 1; }
    yq -e ".secrets[] | select(.name==\"$SECRET\")" "$POLICY_FILE" >/dev/null 2>&1 \
      || { error "'$SECRET' is not in $POLICY_FILE"; exit 1; }
    age="$(secret_age_days "$SECRET")"
    interval="$(yq -r ".secrets[] | select(.name==\"$SECRET\") | .intervalDays" "$POLICY_FILE")"
    if ! $FORCE && (( age < interval )); then
      log "$SECRET is ${age}d old (limit ${interval}d) — nothing to do. Use --force to override."
      exit 0
    fi
    if [[ "$STORE" == "aws" ]]; then rotate_aws "$SECRET"; else rotate_vault "$SECRET"; fi
    $DRY_RUN || force_resync
    ;;
esac
