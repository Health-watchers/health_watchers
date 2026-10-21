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

## Rotation runbook

The catalogue in [`rotation-policy.yaml`](rotation-policy.yaml) is the source of
truth for intervals and methods. The per-secret procedures below assume the
default AWS Secrets Manager store; for Vault, swap `--store aws` for
`--store vault` (paths become `secret/health-watchers/<env>/<secret>`).

### JWT secrets (`jwt-secret`)

- **Interval:** 90 days (see `rotation-policy.yaml`).
- **Method:** generate a new random signing key; the API accepts the previous
  key during a grace window so tokens issued before rotation stay valid.
- **Rotate:**

  ```bash
  ./scripts/secrets/rotate-secret.sh --env production --store aws --secret jwt-secret
  ```

- **Validate:** confirm the new version is `AWSCURRENT` and the old one is
  `AWSPREVIOUS`, then check the API is signing with the new key:

  ```bash
  aws secretsmanager describe-secret \
    --secret-id health-watchers/production/jwt-secret \
    --query 'VersionIdsToStages'
  curl -fsS https://api.health-watchers.example/healthz
  ```

  Existing sessions must keep working (previous key still trusted) and newly
  issued tokens must verify against the new key.
- **Rollback:** promote the previous version back to `AWSCURRENT`:

  ```bash
  aws secretsmanager update-secret-version-stage \
    --secret-id health-watchers/production/jwt-secret \
    --version-stage AWSCURRENT \
    --move-to-version-id <previous-version-id> \
    --remove-from-version-id <current-version-id>
  ```

  then trigger a rolling restart (see below) so pods reload the reverted key.

### Stellar keypairs (`stellar-secret-key`)

- **Interval:** 180 days, or immediately on suspected compromise.
- **Method:** generate a new Stellar keypair, fund/register the new public key
  with the anchor and any allow-lists, then swap the secret. The old keypair is
  retained as `AWSPREVIOUS` until all in-flight transactions settle.
- **Rotate:**

  ```bash
  ./scripts/secrets/rotate-secret.sh --env production --store aws --secret stellar-secret-key
  ```

- **Validate:** the new public key is registered and the service can submit a
  test transaction:

  ```bash
  aws secretsmanager get-secret-value \
    --secret-id health-watchers/production/stellar-secret-key \
    --query 'VersionStage'
  curl -fsS https://api.health-watchers.example/healthz
  ```

  Check the Stellar service logs for successful signing with the new key and no
  `tx_bad_auth` errors.
- **Rollback:** re-promote the previous version (same
  `update-secret-version-stage` command as above, using the Stellar secret id)
  and rolling-restart. Do **not** delete the old keypair until the grace window
  has elapsed.

### MongoDB credentials (`mongodb-credentials`)

- **Interval:** 90 days.
- **Method:** create a new database user with the same roles, update the
  secret, roll the application, then drop the old user once no connections use
  it.
- **Rotate:**

  ```bash
  ./scripts/secrets/rotate-secret.sh --env production --store aws --secret mongodb-credentials
  ```

- **Validate:** the API can connect and run a trivial query; the old user still
  exists during the grace window:

  ```bash
  curl -fsS https://api.health-watchers.example/healthz
  mongosh "$MONGO_URI" --eval 'db.runCommand({ ping: 1 })'
  ```
- **Rollback:** re-promote the previous version and rolling-restart. Keep the
  old database user until the rollback window closes; only then remove it.

## Zero-downtime rotation

Rotation must never take the API down. The procedure relies on **overlapping
secret versions** plus a **rolling restart**:

1. **Write the new version without removing the old.** The rotation script adds
   the new value as `AWSCURRENT` and demotes the old value to `AWSPREVIOUS`; it
   never deletes a version during rotation. Both versions are readable, so pods
   that have not yet reloaded keep working.
2. **Application tolerance.** The API reads the current value and, where
   applicable (JWT signing/verification), also accepts the previous value
   during the grace window. This means a mixed fleet of old and new pods is
   safe.
3. **Rolling restart.** Trigger a rollout so pods pick up the new value one at a
   time, respecting PodDisruptionBudgets:

   ```bash
   kubectl -n health-watchers rollout restart deployment/health-watchers-api
   kubectl -n health-watchers rollout status  deployment/health-watchers-api --timeout=5m
   ```

   External Secrets Operator re-syncs the Kubernetes `Secret` from the store;
   the restart ensures every pod mounts the refreshed value.
4. **Verify.** Watch error rates and the `/healthz` endpoint during the
   rollout. If errors spike, stop and roll back (re-promote `AWSPREVIOUS`).
5. **Clean up.** After the grace window (default 24h) the old version can be
   removed by the scheduled cleanup job; do not remove it manually mid-rollout.

## Testing the rotation Lambda locally

`k8s/secret-rotation-lambda.py` is packaged and deployed by
`k8s/secret-rotation-config.yaml`. To exercise it locally against a dev account
before deploying:

```bash
# 1. Build a deployment package
pip install -r k8s/secret-rotation-requirements.txt -t build/
cp k8s/secret-rotation-lambda.py build/
(cd build && zip -r ../secret-rotation.zip .)

# 2. Create/refresh a test function (dev account only)
aws lambda create-function \
  --function-name health-watchers-secret-rotation-dev \
  --runtime python3.12 \
  --handler secret-rotation-lambda.handler \
  --role "$LAMBDA_ROLE_ARN" \
  --zip-file fileb://secret-rotation.zip

# 3. Invoke it synchronously and inspect the response
aws lambda invoke \
  --function-name health-watchers-secret-rotation-dev \
  --payload '{"env":"staging","dryRun":true}' \
  --cli-binary-format raw-in-base64-out \
  response.json
cat response.json
```

Use `"dryRun": true` first to confirm the function selects the right secrets
without writing. The response contains **keys and metadata only** — never
secret values. Check CloudWatch Logs for the matching invocation.

## Manual rotation via GitHub Actions

The [`Rotate Secrets`](../../.github/workflows/rotate-secrets.yml) workflow
provides an approval-gated manual rotation:

1. Open **Actions → Rotate Secrets → Run workflow**.
2. Choose the `environment` (`staging` or `production`) and the `secret`
   (or `all`), and optionally set `dry_run`.
3. The job pauses at the `production` **environment protection rule**; a
   required reviewer must approve before any write happens.
4. On approval the workflow runs `validate-secrets.sh` then
   `rotate-secret.sh`, and posts the key-only summary to the run log.

Production runs require approval; staging runs proceed automatically. The
workflow uses OIDC to assume a scoped role — no long-lived credentials are
stored in GitHub.

## Alerts

Prometheus alerts for secrets nearing (or past) their rotation date are defined
in [`k8s/prometheus-rules-secrets.yaml`](../../k8s/prometheus-rules-secrets.yaml)
and documented in [`docs/SECRETS_MANAGEMENT.md`](../../docs/SECRETS_MANAGEMENT.md).
They fire on `SecretRotationDueSoon` (within 7 days) and
`SecretRotationOverdue`.
