---
title: Authentication
description: "Staff authentication: registration, login with JWT access and refresh tokens with refresh-token rotation, logout from one or all devices, TOTP MFA with backup codes, account unlock, email verification, password reset, and switching the active clinic."
---

# Authentication

Staff authentication: registration, login with JWT access and refresh tokens with refresh-token rotation, logout from one or all devices, TOTP MFA with backup codes, account unlock, email verification, password reset, and switching the active clinic.

| | |
|---|---|
| **Base path** | `/api/v1/auth` |
| **Source** | [`apps/api/src/modules/auth/auth.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/auth/auth.controller.ts) |

## Data model

- User (`models/user.model.ts`): email, password hash, `role` (`SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT`, `READ_ONLY`, `PATIENT`), `clinicId`, MFA state, lockout counters
- RefreshToken (`models/refresh-token.model.ts`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/auth/register` | Authenticated |
| `POST` | `/api/v1/auth/login` | Public |
| `POST` | `/api/v1/auth/refresh` | Public |
| `POST` | `/api/v1/auth/logout` | Public |
| `POST` | `/api/v1/auth/logout-all` | Authenticated |
| `POST` | `/api/v1/auth/mfa/setup` | Authenticated |
| `POST` | `/api/v1/auth/mfa/verify` | Authenticated |
| `POST` | `/api/v1/auth/mfa/challenge` | Public |
| `POST` | `/api/v1/auth/mfa/backup` | Public |
| `DELETE` | `/api/v1/auth/mfa/disable` | Authenticated |
| `POST` | `/api/v1/auth/unlock` | Authenticated |
| `POST` | `/api/v1/auth/switch-clinic` | Authenticated |
| `GET` | `/api/v1/auth/verify-email` | Public |
| `POST` | `/api/v1/auth/forgot-password` | Public |
| `POST` | `/api/v1/auth/reset-password` | Public |
| `GET` | `/api/v1/auth/mfa/backup-codes/count` | Authenticated |
| `POST` | `/api/v1/auth/mfa/backup-codes/regenerate` | Authenticated |

## Roles

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

:::note

`/auth` uses `authLimiter`, and `/auth/forgot-password` additionally uses `forgotPasswordLimiter`.

:::

## Related

- [Users](/platform/users)
- [Security & HIPAA](/security/hipaa-compliance)
