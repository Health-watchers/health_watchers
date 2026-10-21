# Error Handling Standardization

> Tracking issue: #1289 — [Refactoring] Extract and standardize error handling

## Overview

Health Watchers already has more error-handling infrastructure than a typical
greenfield effort would need to build:

- **`AppError`** (`apps/api/src/utils/app-error.ts`) — structured error class
  with `severity`, `category`, and `code`.
- **`Errors` factory** (`apps/api/src/utils/errors.ts`) — pre-built,
  user-friendly `AppError` instances per domain (`Errors.auth.*`,
  `Errors.patient.*`, `Errors.payment.*`, ...), written specifically to be
  actionable, consistent, safe (no leaked internals), and typed against
  `ApiErrorCode`.
- **`ERROR_TAXONOMY`** (`apps/api/src/utils/error-taxonomy.ts`) — maps error
  codes to `ErrorCategory`, HTTP status, severity, and client-facing message.
- **`errorHandler` middleware** (`apps/api/src/middlewares/error.middleware.ts`) —
  central Express error handler that branches on `AppError`, `ZodError`,
  `MongooseError`, JWT errors, and Mongo server errors; logs by severity; and
  tracks metrics via `errorMetrics` / `getErrorMetrics()`.
- **`error-analytics.service.ts`** and `error-analytics.controller.ts` —
  error metrics tracking and an endpoint to query them.
- **Web error boundaries** — `ErrorBoundary.tsx`, `SectionErrorBoundary.tsx`
  (plus a `ui/` variant of each), `useAsyncError.ts`, and Next.js route-level
  `error.tsx` / `global-error.tsx` files (root, `encounters/`, `payments/`,
  `patients/`).

This means the work for #1289 is largely **coverage and consistency**, not
building new primitives: making sure every module actually throws `AppError`
(via the `Errors` factory) instead of a bare `Error` or an ad hoc HTTP
response, and that every route/section in the web app is wrapped by a
boundary instead of only a few.

## Goal

Every error, in every layer, follows the same shape, is logged with the same
severity/category conventions, and reaches the user as an actionable message
— without hunting through service code to find out which convention a given
module happens to use.

## Task breakdown

1. **Create error hierarchy** — audit whether every module in
   `apps/api/src/modules/**` throws `AppError` subclasses/instances (via
   `Errors.*`) rather than raw `Error`, `throw 'string'`, or manual
   `res.status(x).json(...)`; extend `Errors` with any domain factories that
   are still missing.
2. **Implement error serialization** — confirm `AppError.toJSON()` /
   `sendApiError` (`apps/api/src/utils/api-response.ts`) is the only path that
   turns an error into an HTTP response, so the wire format never diverges
   from `ApiErrorCode`.
3. **Create error boundary component** — consolidate the duplicated
   `ErrorBoundary`/`SectionErrorBoundary` implementations (top-level in
   `components/` vs. `components/ui/`) into one, and ensure every top-level
   route and data-heavy section (not just `encounters`, `payments`,
   `patients`) has an `error.tsx` or boundary.
4. **Implement API error response formatter** — verify `errorHandler`'s
   branches (AppError / ZodError / MongooseError / JWT / Mongo server error)
   all funnel through the same `sendApiError` shape, including in
   not-yet-covered branches.
5. **Add error context to exceptions** — ensure `AppError` construction sites
   consistently attach request context (`requestId`, `userId`, `clinicId` —
   already captured by `requestContext()` in the middleware) rather than
   relying on the middleware to backfill it after the fact.
6. **Create error recovery strategies** — formalize patterns already present
   ad hoc (e.g. `export-error-recovery.service.ts`) into a documented
   convention: retry vs. fail-fast vs. degrade, tied to `ErrorSeverity`.
7. **Implement error logging** — confirm `logBySeverity()` conventions
   (critical/high → `logger.error`, medium → `logger.warn`, low → `logger.info`)
   are followed everywhere errors are caught, not just at the top-level
   handler.
8. **Create error user messages** — audit that every `Errors.*` factory
   message is written for the end user (actionable, no internals) per the
   goals already stated in `errors.ts`; fill gaps for modules using generic
   messages.
9. **Add error metrics tracking** — extend `error-analytics.service.ts`
   coverage so every `AppError` category/severity is recorded, and confirm
   the `error-analytics.controller.ts` endpoint reports on all of them.
10. **Implement error debugging utilities** — ensure dev-mode responses
    (`isDev` branch in `error.middleware.ts`) consistently include stack
    traces / internal detail that is stripped in production, across all
    error branches, not just the `AppError` path.

## Acceptance criteria

- All errors follow the same format — every API error response is shaped by
  `sendApiError`/`AppError`, and every UI error path renders through a
  boundary or the shared error message component
  (`apps/web/src/components/ui/ErrorMessage.tsx`).
- User error messages are helpful — actionable, specific, no leaked internals
  in production, consistent with the tone already set in `errors.ts`.
- Developer error info is sufficient — request context, severity, and
  category are present on every logged error; stack traces available in dev.
- Error tracking is working — `error-analytics` records every error, and
  Sentry capture (`Sentry.captureException`, already wired for high/critical)
  is confirmed to fire for the right severities.

## Non-goals

- Replacing `AppError`/`ERROR_TAXONOMY`/Sentry with different tooling — this
  is a consistency and coverage pass on infrastructure that already exists.
