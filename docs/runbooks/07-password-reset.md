# Password Reset Procedures Runbook

**Service:** Health Watchers  
**Stack:** Node.js, Express, JWT, bcryptjs, otplib (TOTP MFA), nodemailer (SMTP)  
**Compliance:** HIPAA § 164.308(a)(5) — access management procedures  
**Last Updated:** 2026-08-30  
**Owner:** Platform Engineering / Support  

---

## Overview

Health Watchers uses JWT-based authentication with bcrypt-hashed passwords and optional TOTP-based MFA (enforced for doctors and nurses). Password resets are initiated by the user via email link or by an admin via the API.

---

## User-Initiated Password Reset (self-service)

This is the normal flow. No operator action required.

1. User visits the web app and clicks **Forgot password**
2. User enters their email address
3. The API sends a password reset email via SMTP (`POST /api/v2/auth/forgot-password`)
4. User clicks the link in the email (time-limited token)
5. User sets a new password (`POST /api/v2/auth/reset-password`)

**Prerequisites for this flow to work:**
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` must be set as environment variables
- `APP_BASE_URL` must be set so reset links point to the correct URL

**Verify SMTP is configured:**
```bash
kubectl exec -it deployment/api -n health-watchers -- printenv SMTP_HOST
```

If SMTP is not configured, the API will log a HIPAA warning at startup and reset emails will not send. See [SMTP Setup](#smtp-setup) below.

**Time estimate:** < 5 minutes for the user

---

## Admin-Initiated Password Reset

Use when a user cannot receive email or is locked out and the self-service flow is unavailable.

### Via API (recommended)

```bash
# Authenticate as an admin user first to get a JWT token
TOKEN="<admin-jwt-token>"

# Trigger a password reset for a user by email
curl -X POST https://health-watchers.app/api/v2/auth/forgot-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "email": "user@example.com" }'
```

### Via Database (break-glass — last resort)

> Only use this if the API is down or the email system is unavailable.  
> Requires direct MongoDB access. Document this action in the audit log.

```bash
# Connect to MongoDB
kubectl exec -it deployment/mongodb -n health-watchers -- mongosh \
  "mongodb://admin:<password>@localhost:27017/health_watchers?authSource=admin"

# Generate a new bcrypt hash for a temporary password
# (run this in Node.js, not in mongosh)
node -e "const b = require('bcryptjs'); b.hash('TempPass123!', 12).then(h => console.log(h))"

# In mongosh: find the user
db.users.findOne({ email: "user@example.com" }, { _id: 1, email: 1, role: 1 })

# Update their password hash (replace <HASH> with the output above)
db.users.updateOne(
  { email: "user@example.com" },
  {
    $set: {
      password: "<HASH>",
      passwordChangedAt: new Date(),
      mustChangePassword: true
    }
  }
)
```

4. Securely communicate the temporary password to the user out-of-band (phone call, secure message)
5. Instruct the user to change their password immediately on next login
6. Document this action in your incident log (HIPAA audit requirement)

**Time estimate:** 10–15 minutes

---

## MFA Reset (TOTP)

Use when a user has lost access to their authenticator app.

### Via API

```bash
TOKEN="<admin-jwt-token>"
USER_ID="<user-object-id>"

# Disable MFA for the user (they will be prompted to re-enrol on next login)
curl -X POST https://health-watchers.app/api/v2/admin/users/$USER_ID/reset-mfa \
  -H "Authorization: Bearer $TOKEN"
```

### Via Database (break-glass)

```bash
# In mongosh
db.users.updateOne(
  { email: "user@example.com" },
  {
    $set: {
      mfaEnabled: false,
      mfaSecret: null,
      mfaVerified: false
    }
  }
)
```

> **Note:** For doctors and nurses, MFA is enforced. After resetting, they will be placed in a grace period (configured by `MFA_GRACE_PERIOD_HOURS`) before MFA becomes mandatory again. The `mfa-grace-period-job` background job manages this.

**Time estimate:** 5 minutes

---

## JWT Secret Rotation (force all users to re-login)

Use when a JWT secret is suspected to be compromised, or as part of a periodic security rotation.

> **Warning:** Rotating JWT secrets immediately invalidates all active sessions. All users will be logged out.

```bash
# Generate new secrets (min 32 chars each)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Run twice — once for access token secret, once for refresh token secret

# Update the Kubernetes secrets
kubectl create secret generic health-watchers-secrets \
  --from-literal=JWT_ACCESS_TOKEN_SECRET="<new-access-secret>" \
  --from-literal=JWT_REFRESH_TOKEN_SECRET="<new-refresh-secret>" \
  --namespace=health-watchers \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart API pods to pick up the new secrets
kubectl rollout restart deployment/api -n health-watchers
kubectl rollout status deployment/api -n health-watchers --timeout=5m
```

Notify users that they will need to log in again.

**Time estimate:** 10 minutes

---

## Field Encryption Key Rotation (HIPAA § 164.312(a)(2)(iv))

When rotating `FIELD_ENCRYPTION_KEY`:

1. Generate a new 64-char hex key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Set the old key as `FIELD_ENCRYPTION_KEY_V<n>` (for migration period)
3. Set the new key as `FIELD_ENCRYPTION_KEY`
4. Set `FIELD_ENCRYPTION_KEY_VERSION` to the new version number
5. Run a data migration to re-encrypt all PHI fields with the new key
6. Document the rotation date and key version in your compliance records

**Time estimate:** Variable — depends on data volume. Plan a maintenance window.

---

## SMTP Setup

If password reset emails are not sending, verify and configure SMTP:

```bash
# Check current SMTP config (shows whether set, not the values)
kubectl exec -it deployment/api -n health-watchers -- \
  node -e "['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_FROM','APP_BASE_URL'].forEach(k => console.log(k, process.env[k] ? '✅ set' : '❌ MISSING'))"

# Set SMTP environment variables (example with SendGrid)
kubectl set env deployment/api \
  SMTP_HOST=smtp.sendgrid.net \
  SMTP_PORT=587 \
  SMTP_SECURE=false \
  SMTP_USER=apikey \
  SMTP_FROM="Health Watchers <noreply@health-watchers.app>" \
  APP_BASE_URL=https://health-watchers.app \
  -n health-watchers

# SMTP_PASS should be set via a Kubernetes secret, not env directly
kubectl create secret generic smtp-secret \
  --from-literal=SMTP_PASS="<your-smtp-password>" \
  -n health-watchers
```

---

## Checklist After Any Password/Credential Reset

- [ ] Document the action (who, when, why) in the incident/audit log
- [ ] Notify the affected user through a verified channel
- [ ] If break-glass DB access was used, rotate the MongoDB admin password afterward
- [ ] For HIPAA compliance: if a credential was compromised, assess whether PHI was accessed and follow incident response procedures

---

## Related Runbooks

- [User Management Procedures](./09-user-management.md)
- [Incident Response](./03-incident-response.md)
