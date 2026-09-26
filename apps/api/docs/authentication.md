# Authentication Guide

## Overview

Health Watchers uses **JWT Bearer tokens** for authentication. Every protected endpoint requires an `Authorization: Bearer <accessToken>` header.

Two tokens are issued on login:

| Token | Lifetime | Purpose |
|-------|----------|---------|
| `accessToken` | 15 minutes | Sent on every API request |
| `refreshToken` | 7 days | Used only to obtain a new token pair |

---

## Login Flow

### 1. Standard login (no MFA)

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "doctor@clinic.example",
  "password": "Secure@123!"
}
```

**Success response `200`:**

```json
{
  "status": "success",
  "data": {
    "accessToken":  "<jwt>",
    "refreshToken": "<opaque>"
  }
}
```

### 2. Login when MFA is enabled

The login endpoint returns `status: mfa_required` instead of real tokens:

```json
{
  "status": "mfa_required",
  "data": {
    "mfaRequired": true,
    "tempToken": "<short-lived-token>"
  }
}
```

Pass the `tempToken` and the 6-digit TOTP to complete the challenge:

```http
POST /api/v1/auth/mfa/challenge
Content-Type: application/json

{
  "tempToken": "<tempToken>",
  "totp": "123456"
}
```

**Success response:** same `accessToken` / `refreshToken` pair as standard login.

---

## MFA Setup

MFA is **mandatory** for `CLINIC_ADMIN`, `SUPER_ADMIN`, `DOCTOR`, and `NURSE`. A 7-day grace period is granted on first login before enforcement locks the account.

### Step 1 — Generate TOTP secret

```http
POST /api/v1/auth/mfa/setup
Authorization: Bearer <accessToken>
```

Response includes `otpauthUrl` and a base64 QR code (`qrCodeDataUrl`). Scan the QR with any TOTP app (Google Authenticator, Authy, 1Password).

### Step 2 — Confirm and enable

```http
POST /api/v1/auth/mfa/verify
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "totp": "123456" }
```

Response contains **10 single-use backup codes** — store them securely. They are shown only once.

### Using a backup code

If the TOTP device is unavailable, use a backup code in place of the TOTP challenge:

```http
POST /api/v1/auth/mfa/backup
Content-Type: application/json

{
  "tempToken": "<tempToken>",
  "backupCode": "a1b2c3d4e5"
}
```

Each backup code is consumed on use. `remainingBackupCodes` is included in the response so you know when to regenerate.

### Regenerate backup codes

```http
POST /api/v1/auth/mfa/backup-codes/regenerate
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "password": "Secure@123!",
  "totp": "123456"
}
```

Either `totp` or `backupCode` must be provided alongside `password`.

---

## Token Refresh

Access tokens expire after 15 minutes. Refresh before or immediately after receiving a `401`:

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{ "refreshToken": "<refreshToken>" }
```

**Token rotation** — every call issues a brand-new refresh token and immediately invalidates the old one. If the same refresh token is replayed, the entire token family is revoked (all sessions for that user).

---

## Logout

### Single session

```http
POST /api/v1/auth/logout
Content-Type: application/json

{ "refreshToken": "<refreshToken>" }
```

Deletes the refresh token and adds the current access token to the denylist for its remaining TTL.

### All sessions

```http
POST /api/v1/auth/logout-all
Authorization: Bearer <accessToken>
```

Deletes **all** refresh tokens for the user and sets a per-user invalidation timestamp. All access tokens issued before this moment are rejected.

---

## Password Management

### Forgot password

```http
POST /api/v1/auth/forgot-password
Content-Type: application/json

{ "email": "doctor@clinic.example" }
```

Always returns `200` — even if the email doesn't exist — to prevent enumeration.
Rate limited: **3 requests / 1 hour** per IP.

### Reset password

```http
POST /api/v1/auth/reset-password
Content-Type: application/json

{
  "token": "<token-from-email>",
  "newPassword": "NewSecure@456!"
}
```

Reset tokens expire after 1 hour.

### Password requirements

Passwords must be at least 8 characters and include:
- One uppercase letter
- One lowercase letter
- One digit
- One special character (e.g. `!@#$%`)
- Must not be in the top-1000 common passwords list

---

## Account Lockout

After **5 consecutive failed login attempts** (or 5 failed MFA attempts), the account is locked for **30 minutes**. The response is `HTTP 423` with a `Retry-After` header:

```json
{
  "error": "AccountLocked",
  "message": "Account is temporarily locked due to too many failed login attempts.",
  "retryAfter": 900
}
```

`SUPER_ADMIN` users can unlock accounts manually:

```http
POST /api/v1/auth/unlock
Authorization: Bearer <superAdminToken>
Content-Type: application/json

{ "email": "locked-user@clinic.example" }
```

---

## Roles and Permissions

| Role | Description |
|------|-------------|
| `SUPER_ADMIN` | Full platform access; manages clinics and all users |
| `CLINIC_ADMIN` | Manages a single clinic and its staff |
| `DOCTOR` | Clinical write access; full patient and encounter access |
| `NURSE` | Clinical write access; limited admin access |
| `RECEPTIONIST` | Appointment and patient registration |
| `PATIENT` | Portal access only |

**MFA enforcement:** `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE` — mandatory after a 7-day grace period.

### Role creation hierarchy

| Caller role | Can create |
|-------------|-----------|
| `SUPER_ADMIN` | Any role |
| `CLINIC_ADMIN` | `DOCTOR`, `NURSE`, `ASSISTANT`, `READ_ONLY` |

---

## JWT Token Structure

```json
{
  "userId":      "507f1f77bcf86cd799439011",
  "role":        "DOCTOR",
  "clinicId":    "507f1f77bcf86cd799439012",
  "isSuperAdmin": false,
  "iss":         "health-watchers",
  "aud":         "health-watchers-api",
  "exp":         1700000000,
  "iat":         1699999100,
  "jti":         "unique-token-id"
}
```

The `authenticate` middleware validates in this order:
1. `Bearer` header present
2. `iss`, `aud`, `exp`, `jti` claims
3. Signature
4. Token not in denylist (`jti` check)
5. Token not issued before per-user invalidation timestamp

---

## Email Verification

After registration, a verification email is sent. Verify using the link:

```http
GET /api/v1/auth/verify-email/:token
```

Tokens expire after 1 hour.

---

## Example: Full login flow (JavaScript)

```javascript
// 1. Login
const loginRes = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'doctor@clinic.example', password: 'Secure@123!' })
});
const { status, data } = await loginRes.json();

// 2. Handle MFA if required
if (status === 'mfa_required') {
  const totp = prompt('Enter your 6-digit authenticator code:');
  const mfaRes = await fetch('/api/v1/auth/mfa/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tempToken: data.tempToken, totp })
  });
  const { data: tokens } = await mfaRes.json();
  storeTokens(tokens.accessToken, tokens.refreshToken);
} else {
  storeTokens(data.accessToken, data.refreshToken);
}

// 3. Make authenticated requests
const patients = await fetch('/api/v1/patients', {
  headers: { Authorization: `Bearer ${getAccessToken()}` }
});

// 4. Refresh before expiry (access token lives 15 min)
async function refreshTokens() {
  const res = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: getRefreshToken() })
  });
  const { data } = await res.json();
  storeTokens(data.accessToken, data.refreshToken);
}
```
