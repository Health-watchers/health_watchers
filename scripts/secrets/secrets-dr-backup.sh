#!/bin/bash
# scripts/secrets/secrets-dr-backup.sh
# Disaster-recovery backup for the secrets subsystem.
#
# Exports NON-PLAINTEXT material only:
#   - secret inventory + version history + rotation metadata (AWS or Vault)
#   - Vault Raft snapshot (already encrypted by Vault's barrier), when store=vault
#   - the ExternalSecret / SecretStore manifests
# The bundle is encrypted with the backup key and uploaded cross-region with
# object-lock so it satisfies the RPO 1h / RTO 30m target in the DR plan.
#
# Usage:
#   secrets-dr-backup.sh --env production --store aws
#   secrets-dr-backup.sh --env production --store vault --vault-snapshot
#
# Required env: DR_BACKUP_BUCKET, BACKUP_ENCRYPTION_KEY
# Optional env: DR_REGION (default eu-west-1), AWS_REGION (default us-east-1)

set -euo pipefail

ENVIRONMENT=""
STORE="aws"
VAULT_SNAPSHOT=false
AWS_REGION="${AWS_REGION:-us-east-1}"
DR_REGION="${DR_REGION:-eu-west-1}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"

: "${DR_BACKUP_BUCKET:?DR_BACKUP_BUCKET is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"

log()     { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
error()   { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ❌ ERROR: $*" >&2; }
success() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✅ $*"; }
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)            ENVIRONMENT="$2"; shift 2 ;;
    --store)          STORE="$2"; shift 2 ;;
    --vault-snapshot) VAULT_SNAPSHOT=true; shift ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) error "unknown arg: $1"; exit 1 ;;
  esac
done
[[ -n "$ENVIRONMENT" ]] || { error "--env is required"; exit 1; }

BUNDLE_DIR="$WORK/secrets-dr-$ENVIRONMENT-$TS"
mkdir -p "$BUNDLE_DIR"

log "Collecting secrets inventory (metadata only) for env=$ENVIRONMENT store=$STORE"

if [[ "$STORE" == "aws" ]]; then
  aws secretsmanager list-secrets --region "$AWS_REGION" \
    --filters "Key=name,Values=health-watchers/${ENVIRONMENT}/" \
    --query 'SecretList[].{Name:Name,ARN:ARN,LastChanged:LastChangedDate,LastRotated:LastRotatedDate,RotationEnabled:RotationEnabled,Tags:Tags}' \
    > "$BUNDLE_DIR/inventory.json"

  # version history per secret (ids + stages + dates, NOT values)
  mkdir -p "$BUNDLE_DIR/versions"
  jq -r '.[].Name' "$BUNDLE_DIR/inventory.json" | while read -r name; do
    safe="${name//\//_}"
    aws secretsmanager list-secret-version-ids --secret-id "$name" --region "$AWS_REGION" \
      --include-deprecated > "$BUNDLE_DIR/versions/$safe.json" 2>/dev/null || true
  done

  # replication status
  jq -r '.[].Name' "$BUNDLE_DIR/inventory.json" | while read -r name; do
    aws secretsmanager describe-secret --secret-id "$name" --region "$AWS_REGION" \
      --query '{Name:Name,Replication:ReplicationStatus}' 2>/dev/null || true
  done > "$BUNDLE_DIR/replication.json"

else
  vault secrets list -format=json > "$BUNDLE_DIR/mounts.json" 2>/dev/null || true
  {
    echo '['
    first=true
    vault kv list -format=json "secret/health-watchers/${ENVIRONMENT}" 2>/dev/null \
      | jq -r '.[]' | while read -r k; do
        meta="$(vault kv metadata get -format=json "secret/health-watchers/${ENVIRONMENT}/${k}" 2>/dev/null || echo '{}')"
        $first || echo ','
        first=false
        jq -n --arg name "$k" --argjson meta "$meta" '{name:$name, metadata:$meta.data}'
      done
    echo ']'
  } > "$BUNDLE_DIR/inventory.json"

  if $VAULT_SNAPSHOT; then
    log "Taking Vault Raft snapshot (encrypted by Vault barrier)"
    vault operator raft snapshot save "$BUNDLE_DIR/vault-raft-$TS.snap"
  fi
fi

# ESO / store manifests so recovery can rebuild the sync layer
if command -v kubectl >/dev/null; then
  kubectl get externalsecret,secretstore,clustersecretstore -n health-watchers -o yaml \
    > "$BUNDLE_DIR/eso-manifests.yaml" 2>/dev/null || true
fi
cp "$(git rev-parse --show-toplevel)/ops/secrets/rotation-policy.yaml" "$BUNDLE_DIR/" 2>/dev/null || true

cat > "$BUNDLE_DIR/MANIFEST.txt" <<EOF
Health Watchers — Secrets DR bundle
environment : $ENVIRONMENT
store       : $STORE
created     : $TS
host        : $(hostname)
contents    : inventory.json, versions/, replication.json, eso-manifests.yaml,
              rotation-policy.yaml$( $VAULT_SNAPSHOT && echo ", vault-raft snapshot" )
note        : NO plaintext secret values are included in this bundle.
EOF

# --- package + encrypt + upload ---------------------------------------------
ARCHIVE="$WORK/$(basename "$BUNDLE_DIR").tar.gz"
tar -C "$WORK" -czf "$ARCHIVE" "$(basename "$BUNDLE_DIR")"

ENC="$ARCHIVE.enc"
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt \
  -in "$ARCHIVE" -out "$ENC" -pass "pass:$BACKUP_ENCRYPTION_KEY"
SHA="$(sha256sum "$ENC" | awk '{print $1}')"
echo "$SHA  $(basename "$ENC")" > "$ENC.sha256"

DEST="s3://${DR_BACKUP_BUCKET}/secrets/${ENVIRONMENT}/$(basename "$ENC")"
log "Uploading to $DEST (region $DR_REGION, object-lock GOVERNANCE 35d)"
aws s3 cp "$ENC" "$DEST" --region "$DR_REGION" \
  --sse aws:kms --storage-class STANDARD_IA
aws s3 cp "$ENC.sha256" "$DEST.sha256" --region "$DR_REGION"
aws s3api put-object-retention --bucket "$DR_BACKUP_BUCKET" \
  --key "secrets/${ENVIRONMENT}/$(basename "$ENC")" \
  --retention "Mode=GOVERNANCE,RetainUntilDate=$(date -u -d '+35 days' +%Y-%m-%dT%H:%M:%SZ)" \
  --region "$DR_REGION" 2>/dev/null || log "(object-lock not enabled on bucket — skipped)"

# metric for the DR RPO dashboard
METRICS_FILE="${METRICS_FILE:-/tmp/secrets_dr_backup_metrics.txt}"
{
  echo "# HELP secrets_dr_backup_timestamp_seconds Unix time of last secrets DR backup"
  echo "# TYPE secrets_dr_backup_timestamp_seconds gauge"
  echo "secrets_dr_backup_timestamp_seconds{env=\"$ENVIRONMENT\",store=\"$STORE\"} $(date +%s)"
  echo "secrets_dr_backup_bytes{env=\"$ENVIRONMENT\"} $(stat -c%s "$ENC")"
} > "$METRICS_FILE"

success "secrets DR backup complete: $DEST (sha256 $SHA)"
