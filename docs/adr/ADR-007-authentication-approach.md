# ADR-007: Authentication Approach

## Status

Accepted

## Date

2024-03-25

## Context

The platform serves multiple user types with different trust levels:

- **Clinical staff** (DOCTOR, NURSE, CLINIC_ADMIN) who access PHI daily
- **Patients** accessing their own records via a portal
- **SUPER_ADMIN** platform operators
- **API key consumers** (third-party integrations)

Authentication must be:

- Stateless across multiple API pods (no server-side session store for auth state)
- Revocable — a stolen token must be invalidatable immediately
- MFA-enforced for clinical roles (HIPAA § 164.312(d))
- Resistant to token replay after logout or password change
- Auditable — every authentication event must be logged

## Decision

### 1. JWT-based authentication with dual-token rotation

Access tokens are **short-lived (15 min)** to limit the exposure window. Refresh tokens are **long-lived (7 days)** and stored as HTTP-only cookies in browser clients. The flow:

```
POST /auth/login
  → verify password (bcrypt, 12 rounds)
  → check MFA if enabled
  → issue accessToken (15 min, HS256) + refreshToken (7 days, HS256)

POST /auth/refresh
  → verify refresh token signature
  → check token family for rotation replay detection
  → issue new accessToken + rotated refreshToken (old refresh token revoked)

POST /auth/logout
  → add jti to Redis denylist
```

### 2. Token family rotation (refresh token replay detection)

Every refresh token carries a `family` UUID. When a refresh token is consumed, the new token inherits the same family. If the system detects a refresh token from a family that has already been rotated (i.e. a stolen and replayed old token), **the entire family is invalidated**, forcing re-authentication.

### 3. Explicit JWT claim validation

The `validateAccessTokenClaims()` function checks claims in order before signature verification:

1. `iss` (issuer) — must match `JWT_ISSUER`
2. `aud` (audience) — must match `JWT_AUDIENCE`
3. `exp` (expiry) — must not be in the past
4. `jti` (unique token ID) — must be present
5. Signature — verified with the access token secret
6. Redis denylist — `jti` must not be on the denylist
7. Per-user invalidation — `iat` must be after the user's last password-change timestamp

Each failure produces a distinct error code (e.g. `MISSING_ISSUER`, `INVALID_AUDIENCE`, `TOKEN_EXPIRED`) to aid debugging while not leaking information to attackers.

### 4. Token denylist in Redis

On logout or password change, the token `jti` is added to a Redis denylist with a TTL equal to the token's remaining lifetime. This ensures:

- Compromised tokens can be revoked immediately
- The denylist does not grow unboundedly (expired entries auto-clean via TTL)
- Every authenticated request checks the denylist (sub-millisecond Redis lookup)

Per-user invalidation: when a user changes their password, `invalidatedBefore[userId] = now` is stored in Redis. The middleware rejects any token with `iat < invalidatedBefore[userId]`.

### 5. Role-Based Access Control (RBAC)

Token payload includes `userId`, `role`, `clinicId`, and optionally `patientId` and `isSuperAdmin`. The `requireRoles(...roles)` middleware is composed with route handlers:

```typescript
router.delete('/patients/:id', authenticate, requireRoles('CLINIC_ADMIN', 'DOCTOR'), handler)
```

Seven roles are defined: `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT`, `READ_ONLY`, `PATIENT`.

### 6. TOTP Multi-Factor Authentication

MFA is implemented with `otplib` (TOTP, RFC 6238). The flow:

```
Login step 1: verify password → return tempToken (5 min)
Login step 2: POST /auth/mfa-verify with tempToken + TOTP code
  → verify TOTP against mfaSecret
  → issue access + refresh tokens
```

`DOCTOR` and `NURSE` roles have MFA **mandatory**. A grace-period job (`mfa-grace-period-job`) enforces enrolment within a configurable window. Backup codes (hashed) are provided for recovery.

### 7. Account lockout

After `N` consecutive failed login or MFA verification attempts, `lockedUntil` is set on the user document. Locked accounts receive a 423 response until the lockout expires. The brute-force counter resets on successful authentication.

### 8. API key authentication

Third-party integrations authenticate via API keys stored in the `apikeys` collection (hashed). The `authenticate` middleware detects `X-API-Key` header as an alternative to `Bearer` tokens for machine-to-machine flows.

### 9. Three separate JWT secrets

Three distinct secrets with three distinct expiry windows prevent cross-use:

| Token type | Secret env var | Expiry |
|------------|---------------|--------|
| Access token | `JWT_ACCESS_TOKEN_SECRET` | 15 min |
| Refresh token | `JWT_REFRESH_TOKEN_SECRET` | 7 days |
| Temp token (MFA step) | `JWT_TEMP_TOKEN_SECRET` | 5 min |

All secrets require minimum 32 characters, enforced by Zod at startup.

## Consequences

### Positive

- Stateless access tokens scale horizontally without a session store.
- Short access token lifetime limits exposure to theft via XSS or network interception.
- Token family rotation detects stolen refresh tokens and triggers full session revocation.
- Per-user invalidation ensures all sessions are terminated immediately after a password change.
- RBAC is enforced at the middleware layer; business logic does not need to re-check roles.

### Negative / Trade-offs

- Every request incurs a Redis denylist lookup (~0.5 ms); this is acceptable but adds latency.
- Three separate JWT secrets increase key-management complexity.
- Refresh token rotation means only one active session per user (one active refresh token family); multiple simultaneous sessions (desktop + mobile) require separate token families per device, which adds implementation complexity.
- HS256 (symmetric) signing means the same secret is used for sign and verify; if the secret leaks, all tokens can be forged. Asymmetric RS256 would mitigate this at the cost of key-pair management.

### Neutral

- Sentry and logs never receive raw tokens (Pino redacts `authorization` headers and token body fields).

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Session cookies (server-side sessions) | Requires a shared session store across pods; adds state that complicates scaling |
| OAuth 2.0 / OIDC (Keycloak, Auth0) | Adds external dependency and compliance scope; custom JWT keeps the auth boundary within the application for now |
| RS256 asymmetric JWT | Better for multi-service token verification; not needed while only one service verifies tokens |
| Opaque tokens (database lookup on every request) | Slower per-request; JWT with denylist achieves the same revocation semantics with better performance |

## References

- `apps/api/src/modules/auth/token.service.ts` — token signing and verification
- `apps/api/src/modules/auth/jwt-claim-validator.ts` — explicit claim validation
- `apps/api/src/middlewares/auth.middleware.ts` — authenticate + requireRoles
- `apps/api/src/services/token-denylist.service.ts` — Redis denylist
- `apps/api/src/modules/auth/mfa-grace-period-job.ts` — MFA enforcement
