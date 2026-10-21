---
title: Users & Staff
description: "Two routers."
---

# Users & Staff

Two routers. Staff management lets admins invite, update, deactivate and reactivate users, force password resets, and revoke sessions. Self-service lets every user manage their profile, password, MFA, preferences, and sessions.

| | |
|---|---|
| **Base path** | `/api/v1/users` |
| **Source** | [`apps/api/src/modules/users/user-management.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/users/user-management.controller.ts)<br/>[`apps/api/src/modules/users/users.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/users/users.controller.ts) |

## Data model

- Uses the `User` model from the auth module

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/users` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/users` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/users/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PUT` | `/api/v1/users/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `DELETE` | `/api/v1/users/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/users/:id/reset-password` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/users/:id/reactivate` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/users/:id/revoke-sessions` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/users/me` | Authenticated |
| `PATCH` | `/api/v1/users/me/profile` | Authenticated |
| `POST` | `/api/v1/users/me/password` | Authenticated |
| `POST` | `/api/v1/users/me/mfa/enable` | Authenticated |
| `POST` | `/api/v1/users/me/mfa/verify` | Authenticated |
| `POST` | `/api/v1/users/me/mfa/disable` | Authenticated |
| `PATCH` | `/api/v1/users/me/preferences` | Authenticated |
| `GET` | `/api/v1/users/sessions` | Authenticated |
| `DELETE` | `/api/v1/users/sessions/:sessionId` | Authenticated |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Inviting staff (user guide)](/user-guide/inviting-staff)
- [Authentication](/platform/auth)
