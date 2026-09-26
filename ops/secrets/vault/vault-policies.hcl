# Least-privilege Vault ACL policies for Health Watchers.
# Apply with:  vault policy write <name> <section>
# Each policy is bound to a Kubernetes ServiceAccount via the kubernetes auth
# method (see ops/secrets/README.md).

# ─────────────────────────────────────────────────────────────────────────────
# policy: hw-app
# Bound to: system:serviceaccount:health-watchers:health-watchers-sa
# Read-only, scoped to the running environment. No list, no write, no delete.
# ─────────────────────────────────────────────────────────────────────────────
path "secret/data/health-watchers/{{identity.entity.aliases.auth_kubernetes_xxxxx.metadata.service_account_namespace}}/*" {
  capabilities = ["read"]
}

# Explicit, environment-pinned fallback (templating disabled clusters):
path "secret/data/health-watchers/production/*" {
  capabilities = ["read"]
}

path "secret/metadata/health-watchers/production/*" {
  capabilities = ["read"]
}

# Deny everything else under the mount.
path "secret/*" {
  capabilities = ["deny"]
}

# ─────────────────────────────────────────────────────────────────────────────
# policy: hw-rotator
# Bound to: system:serviceaccount:health-watchers:secret-rotator
# May read and write ONLY the secrets it rotates, and read version metadata.
# ─────────────────────────────────────────────────────────────────────────────
path "secret/data/health-watchers/+/mongo-password" {
  capabilities = ["read", "create", "update"]
}
path "secret/data/health-watchers/+/mongo-root-password" {
  capabilities = ["read", "create", "update"]
}
path "secret/data/health-watchers/+/jwt-secret" {
  capabilities = ["read", "create", "update"]
}
path "secret/data/health-watchers/+/refresh-token-pepper" {
  capabilities = ["read", "create", "update"]
}
path "secret/data/health-watchers/+/redis-password" {
  capabilities = ["read", "create", "update"]
}
path "secret/data/health-watchers/+/smtp-credentials" {
  capabilities = ["read", "create", "update"]
}
path "secret/data/health-watchers/+/cdn-api-token" {
  capabilities = ["read", "create", "update"]
}
path "secret/metadata/health-watchers/*" {
  capabilities = ["read", "list"]
}
# Rotator may roll back to a prior version but never destroy history.
path "secret/destroy/health-watchers/*" {
  capabilities = ["deny"]
}

# ─────────────────────────────────────────────────────────────────────────────
# policy: hw-eso
# Bound to: system:serviceaccount:external-secrets:external-secrets
# Read + list so it can enumerate and sync the full environment tree.
# ─────────────────────────────────────────────────────────────────────────────
path "secret/data/health-watchers/*" {
  capabilities = ["read"]
}
path "secret/metadata/health-watchers/*" {
  capabilities = ["read", "list"]
}

# ─────────────────────────────────────────────────────────────────────────────
# policy: hw-break-glass
# Bound to: an operator entity that requires MFA on login.
# Full control for emergencies. Every use is audited and alerts #security-alerts.
# ─────────────────────────────────────────────────────────────────────────────
path "secret/data/health-watchers/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "secret/metadata/health-watchers/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "sys/audit" {
  capabilities = ["read", "sudo"]
}
