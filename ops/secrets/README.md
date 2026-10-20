# ops/secrets

Operator tooling for the Health Watchers secrets management system. Read
[`docs/SECRETS_MANAGEMENT.md`](../../docs/SECRETS_MANAGEMENT.md) first for the
architecture and policy.

## Contents

| Path | Purpose |
|------|---------|
| `rotation-policy.yaml` | Machine-readable secret catalogue, rotation intervals, replica regions. Consumed by the rotation script and CI. |
| `vault/vault-values.yaml` | Helm values for a HA (Raft) Vault install with KMS auto-unseal, audit device, and DR replication. |
| `vault/vault-policies.hcl` | Least-privilege ACL policies bound to Kubernetes ServiceAccounts. |

Scripts live in [`../../scripts/secrets/`](../../scripts/secrets/).

## Quick start

### AWS Secrets Manager (default)

```bash
# 1. Validate the target environment has every required secret, correctly formed
./scripts/secrets/validate-secrets.sh --env staging --store aws

# 2. Rotate a single secret now (respects the method in rotation-policy.yaml)
./scripts/secrets/rotate-secret.sh --env staging --store aws --secret jwt-secret

# 3. Check what is overdue
./scripts/secrets/rotate-secret.sh --env production --store aws --report

# 4. Take a DR backup of secret metadata + version history
./scripts/secrets/secrets-dr-backup.sh --env production --store aws
```

### HashiCorp Vault (self-hosted option)

```bash
helm repo add hashicorp https://helm.releases.hashicorp.com
helm upgrade --install vault hashicorp/vault \
  -n vault --create-namespace \
  -f ops/secrets/vault/vault-values.yaml

# after `vault operator init` + unseal:
vault policy write hw-app        ops/secrets/vault/vault-policies.hcl
vault auth enable kubernetes
vault write auth/kubernetes/role/health-watchers-app \
  bound_service_account_names=health-watchers-sa \
  bound_service_account_namespaces=health-watchers \
  policies=hw-app ttl=1h
```

Then point ESO at Vault by switching the `SecretStore` provider block in
`k8s/external-secrets-enhanced.yaml` (a commented Vault variant is included
there).

## Conventions

- Store paths: `health-watchers/<env>/<secret>` (AWS) or
  `secret/health-watchers/<env>/<secret>` (Vault KV v2).
- Every write carries tags/metadata: `rotatedAt`, `rotatedBy`, `policyInterval`.
- Scripts print **keys only**. A value never reaches stdout, a log file, or a CI
  log.
- All scripts are idempotent and support `--dry-run`.
