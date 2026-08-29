# Secrets Management

This document is the top-level reference for how Health Watchers stores, rotates,
injects, audits, and recovers secrets. It ties together the Kubernetes-level
configuration in [`k8s/`](../k8s/) and the operational tooling in
[`ops/secrets/`](../ops/secrets/) and [`scripts/secrets/`](../scripts/secrets/).

| Attribute | Value |
|-----------|-------|
| Authoritative store (cloud) | AWS Secrets Manager (`health-watchers/<env>/*`) |
| Authoritative store (self-hosted option) | HashiCorp Vault (`secret/health-watchers/<env>/*`) |
| Sync mechanism | External Secrets Operator (ESO) |
| Audit sources | AWS CloudTrail, Vault audit device, Kubernetes audit policy |
| Encryption at rest | AWS KMS (CMK) / Vault AES-256-GCM barrier |
| Encryption in transit | TLS 1.2+ for every store, sync, and injection path |
| Owner | DevOps / Platform Engineering |

## 1. Architecture

```
        ┌─────────────────────────┐        ┌─────────────────────────┐
        │   AWS Secrets Manager    │  OR    │     HashiCorp Vault      │
        │  (KMS-encrypted, CMK)    │        │  (AES-256-GCM barrier)   │
        └───────────┬─────────────┘        └───────────┬─────────────┘
                    │  TLS 1.2+, IRSA / Vault k8s auth  │
                    └───────────────┬──────────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │  External Secrets Operator     │  refreshInterval: 1h
                    └───────────────┬───────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │  Kubernetes Secret (opaque)    │  projected as env / file
                    └───────────────┬───────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │  Application Pods (read-only)  │
                    └───────────────────────────────┘

  Every layer emits an audit record → CloudTrail / Vault audit log / k8s audit log
```

Provider choice is deployment-time only. The application never talks to a secret
store directly — it only reads a projected Kubernetes Secret, so switching
providers is an infrastructure change with no code impact.

## 2. Secret catalogue and rotation policy

The machine-readable source of truth is
[`ops/secrets/rotation-policy.yaml`](../ops/secrets/rotation-policy.yaml).
`scripts/secrets/rotate-secret.sh` and the `secrets-rotation-check` workflow both
read it.

| Secret | Store path (suffix) | Rotation interval | Method | Grace period |
|--------|---------------------|-------------------|--------|--------------|
| MongoDB app password | `mongo-password` | 30 days | Automated (dual-user swap) | 1 h |
| MongoDB root password | `mongo-root-password` | 90 days | Automated | 1 h |
| JWT signing key | `jwt-secret` | 90 days | Automated (overlapping kid) | 24 h |
| Refresh-token pepper | `refresh-token-pepper` | 180 days | Automated | 24 h |
| Redis password | `redis-password` | 90 days | Automated | 5 m |
| Stellar keypair | `stellar-keys` | 180 days | Manual (on-chain step) | n/a |
| Third-party API keys | `api-keys` | 60 days | Semi-automated (provider API) | provider-dependent |
| Backup encryption key | `backup-encryption-key` | 365 days | Manual (re-encrypt archives) | n/a |
| SMTP credentials | `smtp-credentials` | 180 days | Semi-automated | 1 h |
| CDN / WAF API tokens | `cdn-api-token` | 90 days | Semi-automated | 5 m |

**Rotation is enforced, not advisory.** The `secrets-rotation-check` workflow
(see §7) fails and opens an incident issue when any secret exceeds its interval
plus a 7-day grace window.

## 3. Automatic secret injection

Secrets reach workloads through ESO, never through committed manifests:

1. `ExternalSecret` (`k8s/external-secrets-enhanced.yaml`) declares which store
   keys map to which Kubernetes Secret keys.
2. ESO writes an opaque `Secret` and refreshes it every hour (and on demand via
   the `force-sync` annotation).
3. Deployments consume it with `envFrom.secretRef` or a projected volume. Pods
   mount it read-only; the container user cannot write it back.
4. A `Reloader`/`checksum` annotation on the pod template triggers a rolling
   restart when the Secret content hash changes, so rotated values are picked up
   without manual intervention.

Local development uses `.env` files derived from `.env.example`; these are
git-ignored and scanned by `gitleaks` / `scripts/audit-secrets.ts` on every
commit and in CI.

## 4. Least-privilege access

| Principal | Read | Write | Rotate |
|-----------|------|-------|--------|
| Application service account (`health-watchers-sa`) | ✓ (its env only) | ✗ | ✗ |
| ESO controller SA | ✓ | ✗ | ✗ |
| Rotation job (`secret-rotator`) | ✓ | ✓ (target secret only) | ✓ |
| CI pipeline | ✗ (uses short-lived OIDC for deploy only) | ✗ | ✗ |
| DevOps break-glass role | ✓ | ✓ | ✓ (MFA + audited) |

- AWS: scoped resource ARNs with `secretsmanager:GetSecretValue` limited by
  `aws:PrincipalTag` and path prefix — see
  [`k8s/aws-secrets-manager-policy.json`](../k8s/aws-secrets-manager-policy.json).
- Vault: per-role policies in
  [`ops/secrets/vault/vault-policies.hcl`](../ops/secrets/vault/vault-policies.hcl),
  bound to Kubernetes ServiceAccounts via the `kubernetes` auth method.
- No human has standing write access; production writes require assuming the
  break-glass role, which is MFA-gated and alerts `#security-alerts`.

## 5. Secrets validation

`scripts/secrets/validate-secrets.sh` runs in CI (pre-deploy) and can be run
ad hoc. It checks:

- **Presence** — every key required by the target environment exists.
- **Format** — URIs parse, keys are base64/hex where expected, no trailing
  whitespace or accidental quotes.
- **Strength** — minimum length and Shannon-entropy thresholds per secret type.
- **Freshness** — `lastRotatedAt` is within policy + grace.
- **No placeholders** — rejects values matching `changeme`, `example`,
  `your_*_here`, or the strings shipped in `*.example` files.
- **Cross-store consistency** — the digest of the store value matches the
  projected Kubernetes Secret (detects stale ESO sync).

A non-zero exit blocks the deploy.

## 6. Migration procedure

Use `scripts/secrets/migrate-secrets.sh` to move secrets into the authoritative
store (from a `.env` file, an existing plain Kubernetes Secret, or from Vault to
AWS / vice-versa).

1. **Dry run** — `migrate-secrets.sh --source .env --target aws --env staging --dry-run`
   prints the planned writes (keys only, never values).
2. **Backfill** — re-run without `--dry-run`. Each write is tagged with
   `migratedAt` and `migratedBy`.
3. **Verify** — `validate-secrets.sh --env staging` must pass.
4. **Cut over** — apply the `ExternalSecret`, confirm ESO sync, roll the
   deployments.
5. **Decommission** — delete the old plain Secret / `.env` entry and confirm it
   is gone from `kubectl get secret` and from git history (BFG if it ever landed
   in a commit — see [`SECURITY_SECRETS_REMEDIATION.md`](../SECURITY_SECRETS_REMEDIATION.md)).
6. **Record** — note the migration in the change log.

Rollback: the previous store version is retained (AWS `AWSPREVIOUS`, Vault prior
version). `rotate-secret.sh --rollback <secret>` restores it and forces a resync.

## 7. Disaster recovery for secrets

- **AWS**: Secrets Manager multi-region replicas
  (`ops/secrets/rotation-policy.yaml → replicaRegions`) keep an encrypted copy in
  the DR region, re-encrypted with a region-local CMK. CloudTrail and secret
  versions are replicated by AWS.
- **Vault**: Integrated Storage (Raft) with 5 nodes across 3 AZs, plus
  Performance/DR replication to the secondary region. `vault operator raft
  snapshot` runs hourly via a CronJob and ships the snapshot (already encrypted)
  to the geo-redundant backup bucket used by the DR plan.
- `scripts/secrets/secrets-dr-backup.sh` exports **metadata and version
  history** (never plaintext) plus, for Vault, a Raft snapshot, encrypts the
  bundle with the backup CMK/age key, and uploads it cross-region with object
  lock.
- Recovery is covered by [`docs/runbooks/DR_SECRETS_RECOVERY`](../docs/runbooks/)
  and drilled quarterly as part of the DR programme (see
  [`DISASTER_RECOVERY_PROCEDURES.md`](./DISASTER_RECOVERY_PROCEDURES.md)).
- **RTO 30 min / RPO 1 h** for the secrets subsystem.

## 8. Monitoring and alerting

Prometheus rules: [`monitoring/alerts-secrets.yml`](../monitoring/alerts-secrets.yml).

| Alert | Condition | Severity |
|-------|-----------|----------|
| `SecretRotationOverdue` | secret age > policy interval + 7 d | warning |
| `SecretRotationFailed` | rotation job/Lambda error in last 6 h | critical |
| `ExternalSecretSyncFailure` | `externalsecret_status_condition{condition="Ready"} == 0` for 15 m | critical |
| `SecretAccessAnomaly` | `GetSecretValue` rate > 3× 7-day baseline for 10 m | warning |
| `SecretStoreUnreachable` | ESO cannot reach the store for 10 m | critical |
| `VaultSealed` | `vault_core_unsealed == 0` | critical |
| `BreakGlassRoleAssumed` | any assume-role event on the break-glass role | critical (page + Slack) |

Grafana: the "Secrets" row on the security dashboard shows secret age vs policy,
sync status, and access rate.

## 9. Guardrails — no secrets in code or logs

- `gitleaks` pre-commit hook + `.github/workflows/secrets-scanning.yml`.
- `scripts/audit-secrets.ts` (staged / full / since-main modes) wired into
  Husky and CI.
- Logger redaction: the API logger (`apps/api/src/utils/logger`) has a
  deny-list of secret-shaped keys and redacts values before serialisation.
- CI never prints a secret: scripts echo **keys only**; workflow steps that must
  touch values use `add-mask`.
- `.gitignore` covers `.env*` (except `*.example`), `*.pem`, `*.key`, `kubeconfig`.

## 10. Incident response

See [`monitoring/runbooks/SECRETS_MANAGEMENT.md`](../monitoring/runbooks/SECRETS_MANAGEMENT.md)
for the "secret compromised" and "break-glass" procedures. Summary: rotate with
`--force`, restart consumers, revoke derived sessions, pull CloudTrail/Vault
audit evidence, notify `#security-alerts`, post-mortem within 48 h.

## 11. File index

| Path | Purpose |
|------|---------|
| `ops/secrets/README.md` | Operator quick-start |
| `ops/secrets/rotation-policy.yaml` | Machine-readable secret catalogue + policy |
| `ops/secrets/vault/vault-values.yaml` | Helm values for a HA Vault install |
| `ops/secrets/vault/vault-policies.hcl` | Least-privilege Vault policies |
| `scripts/secrets/rotate-secret.sh` | Rotation orchestration (AWS + Vault) |
| `scripts/secrets/validate-secrets.sh` | Pre-deploy validation |
| `scripts/secrets/migrate-secrets.sh` | Import / cross-store migration |
| `scripts/secrets/secrets-dr-backup.sh` | Encrypted geo-redundant metadata/snapshot backup |
| `k8s/external-secrets-enhanced.yaml` | ESO `SecretStore` + `ExternalSecret` |
| `k8s/secret-rotation-lambda.py` | AWS rotation Lambda handler |
| `k8s/secrets-audit-policy.yaml` | Kubernetes audit policy for `secrets` |
| `monitoring/alerts-secrets.yml` | Prometheus alert rules |
| `.github/workflows/secrets-rotation-check.yml` | Scheduled rotation + validation gate |
