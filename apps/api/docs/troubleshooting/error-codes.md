# Error Code Reference

All API errors follow this envelope:

```json
{
  "error": "ErrorType",
  "code": "ERROR_CODE",
  "message": "Human-readable message",
  "requestId": "uuid",
  "details": []
}
```

The `code` field maps to the `ApiErrorCode` enum from `@health-watchers/types`.

---

## 4xx Client Errors

### HTTP 400 — Bad Request

| Code | `error` field | Cause | Fix |
|---|---|---|---|
| `VALIDATION_ERROR` | `ValidationError` | Zod schema failed — missing or invalid field | Check `details[]` array for the exact field path and constraint |
| `BAD_REQUEST` | `BadRequest` | Invalid MongoDB ObjectId in route params | IDs must be 24-char hex strings |
| `BAD_REQUEST` | `BadRequest` | `token` query param missing on email verification | Include `?token=<value>` |
| `BAD_REQUEST` | `BadRequest` | Reset token invalid or expired | Token is SHA-256 hashed and expires in 1 hour; request a new one |
| `BAD_REQUEST` | `BadRequest` | Refund amount ≤ 0 or exceeds original payment | Amount must be positive and ≤ the original payment amount |
| `BAD_REQUEST` | `BadRequest` | `clinicId` does not exist during user registration | Verify the clinic ObjectId exists and is active |
| `VALIDATION_ERROR` | `ValidationError` | Body Content-Type is not `application/json` | Set `Content-Type: application/json` header on POST/PUT/PATCH |
| `UNSUPPORTED_MEDIA_TYPE` | `UnsupportedMediaType` | Body sent without correct Content-Type | HTTP 415 — set `Content-Type: application/json` |

### HTTP 401 — Unauthorized

| Code | `error` field | Cause | Fix |
|---|---|---|---|
| `UNAUTHORIZED` | `Unauthorized` | `Authorization` header missing or not `Bearer <token>` | Include `Authorization: Bearer <access_token>` |
| `INVALID_TOKEN` | `InvalidToken` | JWT signature invalid, malformed, wrong `iss`/`aud`, missing `jti` | Re-authenticate; do not alter the token |
| `TOKEN_EXPIRED` | `TokenExpired` | Access token past its 15-minute expiry | Call `POST /auth/refresh` with a valid refresh token |
| `INVALID_TOKEN` | `Unauthorized` | Token on the denylist (logged out / revoked) | Re-authenticate |
| `INVALID_TOKEN` | `Unauthorized` | Token issued before a password change | Re-authenticate; password change invalidates all prior tokens |
| `UNAUTHORIZED` | `Unauthorized` | Invalid email or password at login | Verify credentials; check caps lock |
| `UNAUTHORIZED` | `Unauthorized` | User account is inactive | Contact SUPER_ADMIN to re-activate |
| `UNAUTHORIZED` | `Unauthorized` | Temp MFA token invalid or expired | Temp tokens expire in 5 minutes; restart the login flow |
| `UNAUTHORIZED` | `Unauthorized` | Refresh token not found in database | Session expired; log in again |
| `UNAUTHORIZED` | `Unauthorized` | Token reuse detected | All sessions for this family revoked as replay protection; log in again |

### HTTP 403 — Forbidden

| Code | `error` field | Cause | Fix |
|---|---|---|---|
| `FORBIDDEN` | `Forbidden` | User role not in the required role list | Use an account with the correct role |
| `FORBIDDEN` | `Forbidden` | CLINIC_ADMIN trying to create SUPER_ADMIN user | Only SUPER_ADMIN can create other SUPER_ADMINs |
| `FORBIDDEN` | `MfaRequired` | Role requires MFA but grace period expired | Set up TOTP at `POST /auth/mfa/setup` |
| `FORBIDDEN` | `Forbidden` | Trying to disable MFA on a required role (DOCTOR, NURSE, CLINIC_ADMIN, SUPER_ADMIN) | MFA cannot be disabled for these roles |
| `FORBIDDEN` | `Forbidden` | Non-SUPER_ADMIN calling `/auth/switch-clinic` | SUPER_ADMIN only |
| `FORBIDDEN` | `Forbidden` | Clinic-scoped resource accessed from wrong clinic | Tokens are clinic-scoped; use the correct account or switch-clinic |

### HTTP 404 — Not Found

| Code | `error` field | Cause | Fix |
|---|---|---|---|
| `NOT_FOUND` | `NotFound` | Resource with given ID does not exist | Verify the ID; check if the record was soft-deleted |
| — | `{ message: "Route not found" }` | URL path does not match any registered route | Check API version prefix (`/api/v1` or `/api/v2`) |

### HTTP 409 — Conflict

| Code | `error` field | Cause | Fix |
|---|---|---|---|
| `CONFLICT` | `Conflict` | MongoDB duplicate key (unique index violation) | The `field` property identifies the duplicate; use a unique value |
| `CONFLICT` | `Conflict` | Email already registered | Use a different email or recover the existing account |
| `CONFLICT` | `Conflict` | Dispute already exists for this payment intent | One dispute per payment; retrieve the existing dispute |
| `CONFLICT` | `Conflict` | Refund already issued for this dispute | Check `refundIntentId` on the dispute |
| `CONFLICT` | `Conflict` | MFA not enabled on account (backup code count endpoint) | Enable MFA first |

### HTTP 415 — Unsupported Media Type

| Code | Cause | Fix |
|---|---|---|
| `UNSUPPORTED_MEDIA_TYPE` | POST/PUT/PATCH without `Content-Type: application/json` | Add the header; multipart routes (`/patients/import`) are exempt |

### HTTP 423 — Locked

| Code | `error` field | Cause | Fix |
|---|---|---|---|
| — | `AccountLocked` | 5 consecutive failed login attempts or 5 failed MFA attempts | Wait 15 minutes or ask SUPER_ADMIN to call `POST /auth/unlock` |

### HTTP 425 — Too Early

| Code | Cause | Fix |
|---|---|---|
| — | Dispute resolution attempted before 7-day review period ends | Wait until `reviewDeadline`; SUPER_ADMIN can override |

### HTTP 429 — Too Many Requests

| Limiter | Limit | Window | Key | Retry-After header |
|---|---|---|---|---|
| `auth` | 5 requests | 15 min | per IP | ✅ |
| `forgot-password` | 3 requests | 1 hour | per IP | ✅ |
| `general` | 300 requests | 15 min | per IP | ✅ |
| `ai` | 20 requests | 1 min | per clinicId | ✅ |
| `payment` | 20 requests | 1 min | per clinicId | ✅ |
| `bulk-export` | 5 requests | 1 hour | per userId | ✅ |
| `patient-search` | 100 requests | 1 min | per userId | ✅ |
| `report-generation` | 10 requests | 1 hour | per userId | ✅ |

All 429 responses include `Retry-After` (seconds) and standard `RateLimit-*` headers.

---

## 5xx Server Errors

### HTTP 500 — Internal Server Error

| Code | `error` field | Cause | Fix |
|---|---|---|---|
| `INTERNAL_SERVER_ERROR` | `InternalServerError` | Unhandled exception — reported to Sentry | Check Sentry with the `requestId` from the response |

### HTTP 503 — Service Unavailable

Not emitted by the app directly — returned by load balancer or Docker health check when `/health/ready` fails.

---

## Validation Error Details Format

When the code is `VALIDATION_ERROR`, the `details` array describes every invalid field:

```json
{
  "error": "ValidationError",
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed. Please check the following field(s): \"email\", \"password\".",
  "details": [
    { "path": "email", "message": "Invalid email" },
    { "path": "password", "message": "String must contain at least 8 character(s)" }
  ],
  "requestId": "abc-123"
}
```

---

## Error Severity Levels

The internal `AppError` class assigns severity for metrics and log routing:

| Severity | Log level | Sentry | Examples |
|---|---|---|---|
| `low` | `info` | No | Validation errors, 401, 403, 404 |
| `medium` | `warn` | No | Business rule violations, duplicate entries |
| `high` | `error` | Yes | Unexpected failures in critical paths |
| `critical` | `error` | Yes | Data corruption risk, encryption failures |

---

## CORS Errors

CORS errors do not produce a JSON body. They appear as network errors in the browser.

| Symptom | Cause | Fix |
|---|---|---|
| `CORS: origin 'X' not allowed` | Origin not in `ALLOWED_ORIGINS` env var | Add the origin to `ALLOWED_ORIGINS` (comma-separated) |
| Preflight 401 | Authorization header on a CORS preflight | `Authorization` is in `allowedHeaders` — check the origin first |
| Missing `X-Request-ID` on response | Non-CORS issue | Header is in `exposedHeaders`; check the route is registered |
