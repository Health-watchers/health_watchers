# User Management Procedures Runbook

**Service:** Health Watchers  
**Stack:** Node.js, Express, MongoDB, JWT, otplib (MFA), bcryptjs  
**Compliance:** HIPAA § 164.308(a)(3) — workforce access management  
**Last Updated:** 2026-08-30  
**Owner:** Platform Engineering / Support  

---

## Overview

Users in Health Watchers have role-based access. Roles include `patient`, `doctor`, `nurse`, and `admin`. Doctors and nurses have MFA enforced. All user management actions are logged in the audit trail.

---

## User Roles

| Role | Access Level | MFA Required |
|---|---|---|
| `patient` | Own records only | Optional |
| `nurse` | Patient records, appointments | **Enforced** |
| `doctor` | Patient records, prescriptions, encounters | **Enforced** |
| `admin` | Full platform access | **Enforced** |

---

## Create a New User

### Via API (normal path)

```bash
TOKEN="<admin-jwt>"

curl -X POST https://health-watchers.app/api/v2/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "email": "newuser@example.com",
    "firstName": "Jane",
    "lastName": "Smith",
    "role": "nurse",
    "password": "TempPass123!"
  }'
```

The user receives a welcome email with instructions to set their password and, if applicable, enrol in MFA.

**Time estimate:** 2 minutes

---

### Via Database (break-glass)

Only use when the API is unavailable.

```bash
# 1. Generate a bcrypt hash for the temporary password
node -e "const b = require('bcryptjs'); b.hash('TempPass123!', 12).then(h => console.log(h))"

# 2. Connect to MongoDB
kubectl exec -it deployment/mongodb -n health-watchers -- mongosh \
  "mongodb://admin:<password>@localhost:27017/health_watchers?authSource=admin"

# 3. Insert the user document
db.users.insertOne({
  email: "newuser@example.com",
  firstName: "Jane",
  lastName: "Smith",
  role: "nurse",
  password: "<bcrypt-hash>",
  mustChangePassword: true,
  mfaEnabled: false,
  mfaVerified: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

**Time estimate:** 10 minutes

---

## Deactivate / Suspend a User

Use when an employee leaves, a contract ends, or an account is suspected of compromise. Deactivation preserves all records (required for HIPAA audit trail).

### Via API

```bash
TOKEN="<admin-jwt>"
USER_ID="<mongodb-object-id>"

curl -X PATCH https://health-watchers.app/api/v2/admin/users/$USER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "isActive": false }'
```

### Via Database (break-glass)

```bash
# In mongosh
db.users.updateOne(
  { email: "user@example.com" },
  {
    $set: {
      isActive: false,
      deactivatedAt: new Date(),
      deactivatedReason: "Employment ended"
    }
  }
)
```

> **Do not delete user records.** HIPAA requires audit trails to be retained. Deactivate only.

After deactivation, invalidate any active JWT refresh tokens to force immediate logout:

```bash
# Via API
curl -X POST https://health-watchers.app/api/v2/admin/users/$USER_ID/revoke-sessions \
  -H "Authorization: Bearer $TOKEN"
```

**Time estimate:** 5 minutes

---

## Reactivate a User

```bash
TOKEN="<admin-jwt>"
USER_ID="<mongodb-object-id>"

curl -X PATCH https://health-watchers.app/api/v2/admin/users/$USER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "isActive": true }'
```

**Time estimate:** 2 minutes

---

## Change User Role

```bash
TOKEN="<admin-jwt>"
USER_ID="<mongodb-object-id>"

curl -X PATCH https://health-watchers.app/api/v2/admin/users/$USER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "role": "doctor" }'
```

> When promoting to `doctor` or `nurse`, MFA enforcement kicks in. The user enters a grace period (configured by `MFA_GRACE_PERIOD_HOURS` env var) before MFA becomes mandatory. The `mfa-grace-period-job` background job manages expiry.

**Time estimate:** 2 minutes

---

## Reset MFA for a User

See [Password Reset Runbook — MFA Reset](./07-password-reset.md#mfa-reset-totp).

---

## Bulk User Operations

### List all active users (admin)

```bash
TOKEN="<admin-jwt>"

curl -X GET "https://health-watchers.app/api/v2/admin/users?isActive=true&limit=100" \
  -H "Authorization: Bearer $TOKEN"
```

### Find users with expired MFA grace period

```bash
# In mongosh — users whose grace period expired but MFA is still not enabled
db.users.find({
  role: { $in: ["doctor", "nurse", "admin"] },
  mfaEnabled: false,
  mfaGracePeriodExpiry: { $lt: new Date() }
}, { email: 1, role: 1, mfaGracePeriodExpiry: 1 })
```

### Export all user records (compliance audit)

```bash
TOKEN="<admin-jwt>"

curl -X GET "https://health-watchers.app/api/v2/admin/users/export?format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o users_audit_$(date +%Y%m%d).csv
```

---

## Offboarding Checklist (staff departure)

When a staff member (doctor, nurse, admin) leaves:

- [ ] Deactivate their account via API immediately
- [ ] Revoke all active sessions (`/revoke-sessions`)
- [ ] Reassign any open appointments or encounters to another provider
- [ ] Review and reassign any pending tasks or waitlist entries
- [ ] Confirm their records are retained (do not delete — HIPAA requirement)
- [ ] Document the deactivation date and reason in your HR system
- [ ] If account was potentially compromised, follow [Incident Response Runbook](./03-incident-response.md)

**Time estimate:** 15–30 minutes

---

## Onboarding Checklist (new staff)

- [ ] Create user account with correct role
- [ ] User receives welcome email with temporary password
- [ ] User logs in and changes password
- [ ] If doctor/nurse/admin: user enrols in MFA within the grace period
- [ ] Confirm user can access required resources
- [ ] Brief user on HIPAA responsibilities and data handling policies
- [ ] Record completion of security training (tracked via `SECURITY_TRAINING_EXPIRY_DAYS` env var)

**Time estimate:** 20–30 minutes

---

## Security Training Enforcement

Security training expiry is tracked per user. The default window is 365 days, configurable via `SECURITY_TRAINING_EXPIRY_DAYS`.

```bash
# Find users with expired security training
# In mongosh
db.users.find({
  securityTrainingCompletedAt: {
    $lt: new Date(Date.now() - (365 * 24 * 60 * 60 * 1000))
  }
}, { email: 1, role: 1, securityTrainingCompletedAt: 1 })
```

---

## Related Runbooks

- [Password Reset Procedures](./07-password-reset.md)
- [Incident Response](./03-incident-response.md)
- [Data Export](./08-data-export.md)
