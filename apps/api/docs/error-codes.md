# Error Code Reference

All error responses follow a consistent envelope:

```json
{
  "error":     "ValidationError",
  "code":      "VALIDATION_ERROR",
  "message":   "Human-readable description.",
  "details":   [...],
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

- `error` — short error category (matches the HTTP status class)
- `code` — machine-readable constant for programmatic handling
- `message` — safe to display to end users
- `details` — present for validation errors; array of `{ path, message }` objects
- `requestId` — correlates to server logs; include in support requests

---

## HTTP Status Codes

| Status | When used |
|--------|-----------|
| `200` | Success |
| `201` | Resource created |
| `204` | Success, no body |
| `400` | Bad request / validation failure |
| `401` | Missing or invalid authentication |
| `402` | Payment required (fee budget exceeded) |
| `403` | Authenticated but insufficient role |
| `404` | Resource not found |
| `409` | Conflict (duplicate key, already confirmed) |
| `415` | Unsupported media type (non-JSON body) |
| `423` | Account locked |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error |
| `502` | Upstream service error (Stellar Horizon) |

---

## Error Code Catalogue

### Authentication & Authorization

| `code` | `error` | HTTP | Description |
|--------|---------|------|-------------|
| `UNAUTHORIZED` | `Unauthorized` | 401 | Missing or malformed `Authorization` header |
| `INVALID_TOKEN` | `Unauthorized` | 401 | Token signature invalid, expired, revoked, or claim check failed |
| `TOKEN_EXPIRED` | `TokenExpired` | 401 | Access token has passed its `exp` claim |
| `FORBIDDEN` | `Forbidden` | 403 | Authenticated but role not permitted for this resource |
| `MFA_REQUIRED` | `MfaRequired` | 403 | 2FA is mandatory for the role and grace period has expired |
| `ACCOUNT_LOCKED` | `AccountLocked` | 423 | Account temporarily locked after repeated failed attempts |

**Token validation failure reasons** (included in `message`):

| Reason key | Meaning |
|------------|---------|
| `MISSING_ISSUER` | `iss` claim absent |
| `INVALID_ISSUER` | `iss` not trusted |
| `MISSING_AUDIENCE` | `aud` claim absent |
| `INVALID_AUDIENCE` | `aud` not accepted |
| `MISSING_EXPIRY` | `exp` claim absent |
| `TOKEN_EXPIRED` | Token past expiry |
| `MISSING_JTI` | `jti` claim absent |
| `INVALID_SIGNATURE` | Signature verification failed |
| `MALFORMED_TOKEN` | Could not decode token |

---

### Validation

| `code` | `error` | HTTP | Description |
|--------|---------|------|-------------|
| `VALIDATION_ERROR` | `ValidationError` | 400 | Zod or Mongoose schema violation |
| `BAD_REQUEST` | `BadRequest` | 400 | Generic bad request (e.g. missing required body field) |
| `INVALID_ID` | `BadRequest` | 400 | Path param is not a valid 24-char hex ObjectId |
| `UNSUPPORTED_MEDIA_TYPE` | `UnsupportedMediaType` | 415 | Content-Type must be `application/json` for mutating requests |

Validation errors include a `details` array:

```json
{
  "error": "ValidationError",
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed. Please check the following field(s): \"email\", \"password\".",
  "details": [
    { "path": "email",    "message": "Invalid email" },
    { "path": "password", "message": "Password must contain at least one uppercase letter" }
  ],
  "requestId": "..."
}
```

---

### Resources

| `code` | `error` | HTTP | Description |
|--------|---------|------|-------------|
| `NOT_FOUND` | `NotFound` | 404 | Resource does not exist or does not belong to the caller's clinic |
| `CONFLICT` | `Conflict` | 409 | Duplicate key (e.g. email already in use) |

---

### Payments

| `code` | `error` | HTTP | Description |
|--------|---------|------|-------------|
| `PAYMENT_INTENT_NOT_FOUND` | `NotFound` | 404 | Payment intent ID does not exist |
| `PAYMENT_ALREADY_CONFIRMED` | `Conflict` | 409 | Intent already confirmed or tx hash already used |
| `FEE_BUDGET_EXCEEDED` | `PaymentRequired` | 402 | Platform fee budget for the period is exhausted |
| `STELLAR_ERROR` | `BadGateway` | 502 | Stellar Horizon returned an error |
| `UNSUPPORTED_ASSET` | `BadRequest` | 400 | Asset code not supported by the platform |
| `MEMO_TOO_LONG` | `BadRequest` | 400 | Memo exceeds Stellar's 28-character limit |

---

### Rate Limiting

| `code` | `error` | HTTP | Description |
|--------|---------|------|-------------|
| `TOO_MANY_REQUESTS` | `TooManyRequests` | 429 | Rate limit exceeded. Check `Retry-After` header. |

---

### Server Errors

| `code` | `error` | HTTP | Description |
|--------|---------|------|-------------|
| `INTERNAL_SERVER_ERROR` | `InternalServerError` | 500 | Unexpected error — logged and reported to Sentry |

In development (`NODE_ENV !== production`) the `stack` field is included in 500 responses.

---

## Recommended Error Handling Pattern

```typescript
interface ApiError {
  error: string;
  code: string;
  message: string;
  details?: { path: string; message: string }[];
  requestId?: string;
}

async function callApi(url: string, options?: RequestInit) {
  const res = await fetch(url, options);

  if (res.ok) return res.json();

  const err: ApiError = await res.json();

  switch (err.code) {
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      // Refresh and retry once
      await refreshTokens();
      return callApi(url, options);

    case 'FORBIDDEN':
      throw new Error(`Permission denied: ${err.message}`);

    case 'VALIDATION_ERROR':
      // Show field-level errors to user
      showFormErrors(err.details ?? []);
      break;

    case 'TOO_MANY_REQUESTS':
      // Back off and retry
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60');
      await sleep(retryAfter * 1000);
      return callApi(url, options);

    default:
      throw new Error(err.message);
  }
}
```

---

## Including `requestId` in Support Requests

Every error response includes a `requestId` UUID. This correlates directly to the structured log line on the server. When opening a support ticket, include:

1. The full URL and HTTP method
2. The `requestId` from the response
3. The timestamp (UTC)
4. Your `clinicId` (from the JWT payload)
