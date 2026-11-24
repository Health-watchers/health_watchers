# Runbook: Secrets Recovery

**Use when:** the secret store is lost or corrupted — region loss of AWS Secrets
Manager, Vault quorum loss / unrecoverable seal, accidental bulk deletion.
**Objective:** RTO 30 min, RPO 1 h.
**Owner:** DevOps on-call + Security.

> Backups produced by
> [`scripts/secrets/secrets-dr-backup.sh`](../../scripts/secrets/secrets-dr-backup.sh)
> (metadata + version history + Vault Raft snapshot; **no plaintext**).
> Policy: [`../SECRETS_MANAGEMENT.md`](../SECRETS_MANAGEMENT.md).

## A. AWS Secrets Manager — region loss

Secrets are replicated to `eu-west-1` with a region-local CMK.

```bash
# 1. Promote the replica to a standalone secret in the DR region
aws secretsmanager list-secrets --region eu-west-1 \
  --filters Key=name,Values=health-watchers/production/
aws secretsmanager stop-replication-to-replica \
  --secret-id health-watchers/production/<name> --region eu-west-1
```

```bash
# 2. Point ESO at the DR region
kubectl -n external-secrets edit secretstore health-watchers-aws   # region: eu-west-1
kubectl -n health-watchers annotate externalsecret health-watchers-secrets \
  force-sync=$(date +%s) --overwrite
```

```bash
# 3. Validate + roll consumers
scripts/secrets/validate-secrets.sh --env production --store aws --k8s-check
kubectl -n health-watchers rollout restart deploy -l app.kubernetes.io/part-of=health-watchers
```

When `us-east-1` returns, re-establish replication from the promoted DR secret
back to the primary, then fail the store region back during a maintenance window.

## B. HashiCorp Vault — quorum / seal loss

```bash
# 1. Bring up a fresh Vault (ops/secrets/vault/vault-values.yaml), do NOT init
helm upgrade --install vault hashicorp/vault -n vault -f ops/secrets/vault/vault-values.yaml

# 2. Restore the newest Raft snapshot from the DR bundle
aws s3 cp s3://$DR_BACKUP_BUCKET/secrets/production/<bundle>.enc /restore/ --region eu-west-1
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in /restore/<bundle>.enc -out /restore/bundle.tar.gz -pass "pass:$BACKUP_ENCRYPTION_KEY"
tar -xzf /restore/bundle.tar.gz -C /restore

vault operator init            # only if the snapshot is pre-init; else skip
vault operator raft snapshot restore -force /restore/*/vault-raft-*.snap
```

KMS auto-unseal means no unseal keys are needed — the new pods unseal against
`alias/health-watchers-vault-unseal` automatically. Confirm:
`vault status` → `Sealed false`, `vault operator raft list-peers` → quorum.

```bash
# 3. Re-apply auth + policies, then resync ESO
vault policy write hw-app     ops/secrets/vault/vault-policies.hcl
vault policy write hw-rotator ops/secrets/vault/vault-policies.hcl
vault policy write hw-eso     ops/secrets/vault/vault-policies.hcl
kubectl -n health-watchers annotate externalsecret health-watchers-secrets force-sync=$(date +%s) --overwrite
scripts/secrets/validate-secrets.sh --env production --store vault --k8s-check
```

## C. Accidental bulk deletion (either store)

1. AWS: `aws secretsmanager restore-secret --secret-id <name>` within the 7–30 day
   recovery window; otherwise recreate from the last DR bundle's version history +
   a fresh rotation.
2. Vault: `vault kv rollback -version=<n> secret/health-watchers/production/<name>`
   or restore the Raft snapshot (§B).
3. Rotate everything that was exposed during recovery:
   `for s in $(yq -r '.secrets[].name' ops/secrets/rotation-policy.yaml); do
   scripts/secrets/rotate-secret.sh --env production --secret "$s" --force; done`.

## Verify

- `scripts/secrets/validate-secrets.sh --env production --store <aws|vault> --k8s-check` → exit 0
- App `/api/health/deep` → 200 (DB, Redis, Stellar auth all OK)
- No `ExternalSecretSyncFailure` / `VaultSealed` alerts firing

## Close out

- Security post-mortem within 48 h; capture CloudTrail / Vault audit evidence.
- Take a fresh `secrets-dr-backup.sh` immediately after recovery.
- Record measured RTO/RPO in `docs/DR_DRILL_LOG.md`.
