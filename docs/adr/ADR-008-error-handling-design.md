# ADR-008: Error Handling Design

## Status

Accepted

## Date

2024-04-01

## Context

A healthcare API must produce consistent, machine-readable error responses so that:

- Frontend clients can render appropriate UI messages without parsing freeform strings
- Monitoring systems can classify errors by severity and category without log-parsing heuristics
- HIPAA compliance is maintained — stack traces and internal details must not be returned in production
- Developers can debug issues quickly — in development, more detail is helpful

Ad-hoc `res.status(X).json({ message: ... })` scattered across route handlers is inconsistent, hard to monitor, and leaks implementation details.

## Decision

### Centralised error handler (`error.middleware.ts`)

A single `errorHandler` Express middleware registered as the last `app.use()` handles all errors passed via `next(err)`. It classifies errors by type and maps them to structured responses.

### Typed `AppError` class

All intentional application errors are thrown as `AppError`:

```typescript
throw new AppError(
  'Patient not found',
  404,
  'NOT_FOUND',           // ApiErrorCode
  'medium',              // severity: 'low' | 'medium' | 'high' | 'critical'
  'resource',            // category: string
  { patientId }          // optional context (never PHI)
);
```

Fields:

| Field | Purpose |
|-------|---------|
| `message` | Human-readable description (safe to show in development) |
| `statusCode` | HTTP status code |
| `code` | Machine-readable `ApiErrorCode` enum value |
| `severity` | Controls log level — `critical`/`high` → `logger.error`, `medium` → `logger.warn`, `low` → `logger.info` |
| `category` | Groups errors for analytics (e.g. `authentication`, `validation`, `resource`, `conflict`) |
| `context` | Optional extra context for log enrichment — must never contain PHI |

### Error type mapping

The handler recognises and maps six distinct error shapes:

| Error type | HTTP status | Code |
|------------|-------------|------|
| `AppError` | `err.statusCode` | `err.code` |
| `ZodError` | 400 | `VALIDATION_ERROR` |
| `MongooseError.ValidationError` | 400 | `VALIDATION_ERROR` |
| `MongooseError.CastError` (bad ObjectId) | 400 | `BAD_REQUEST` |
| MongoDB duplicate key (code 11000) | 409 | `CONFLICT` |
| `TokenExpiredError` | 401 | `TOKEN_EXPIRED` |
| `JsonWebTokenError` | 401 | `INVALID_TOKEN` |
| Unhandled / unexpected | 500 | `INTERNAL_SERVER_ERROR` |

### Uniform response shape

All error responses follow the same envelope:

```json
{
  "error": "ValidationError",
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed. Please check: \"email\", \"dateOfBirth\".",
  "details": [{ "path": "email", "message": "Invalid email" }],
  "requestId": "b4f2e1a0-..."
}
```

The `requestId` is propagated from the correlation middleware, allowing support staff to find the exact log entry for a user-reported error.

### Production vs development behaviour

- **Production**: stack traces are never included in responses; only the message and code are returned.
- **Development** (`NODE_ENV !== 'production'`): `stack` is included in 5xx responses to aid local debugging.

Unexpected 5xx errors are reported to **Sentry** (`Sentry.captureException`). 4xx errors are not sent to Sentry (they are expected client errors).

### In-process error analytics

`errorMetrics` counters track totals by severity and category without requiring a metrics exporter. The `getErrorMetrics()` function is exposed via `/api/v2/error-analytics` for admin dashboards.

### Logging levels by severity

```
critical / high  →  logger.error(...)   — wakes on-call
medium           →  logger.warn(...)    — reviewed daily
low              →  logger.info(...)    — informational
```

This prevents alert fatigue by only paging on errors that genuinely require immediate attention.

## Consequences

### Positive

- Every error response has the same shape — frontends can write a single error interceptor.
- Severity-driven logging prevents low-severity validation errors from flooding error dashboards.
- `requestId` in every error enables O(1) log lookup for support requests.
- `AppError` makes it easy to add new error types without touching the error handler.
- PHI is never included in `context` by convention — this is enforced by code review.

### Negative / Trade-offs

- Developers must remember to throw `AppError` (or a subclass) rather than generic `Error`; unstructured throws fall through to the 500 handler.
- The error analytics counters are in-process and reset on pod restart; for persistent metrics, export them to Prometheus.

### Neutral

- `ZodError`, `MongooseError`, and `JsonWebTokenError` are handled automatically — third-party library errors do not require wrapping in `AppError`.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Per-route try/catch with `res.json(...)` | Inconsistent; duplicated logic; hard to audit for information leakage |
| HTTP Problem Details (RFC 7807) | Good standard; JSON envelope is functionally equivalent and simpler for the current frontend contract |
| Global `process.on('uncaughtException')` as sole handler | Catches only synchronous throws; Express async errors need `next(err)` regardless |

## References

- `apps/api/src/middlewares/error.middleware.ts` — centralised handler
- `apps/api/src/utils/app-error.ts` — `AppError` class
- `apps/api/src/utils/api-response.ts` — `sendApiError` helper
- `apps/api/src/middlewares/correlation.middleware.ts` — `requestId` propagation
- `apps/api/src/services/error-analytics.service.ts` — in-process metrics
- `apps/api/src/modules/monitoring/error-analytics.controller.ts` — admin endpoint
