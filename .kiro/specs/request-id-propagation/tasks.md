# Implementation Plan: Request ID Propagation

## Overview

Implement end-to-end request ID propagation across the API and stellar-service using TypeScript. The work is split into four incremental steps: type extension, middleware, stellar-client updates, and stellar-service pino adoption — wired together at the end.

## Tasks

- [ ] 1. Extend Express Request type to include `requestId`
  - Add `requestId?: string` to the `Request` interface in `apps/api/src/types/express.d.ts`
  - _Requirements: 1.4_

- [ ] 2. Implement `requestIdMiddleware` and register it in the API
  - [ ] 2.1 Create `apps/api/src/middlewares/requestId.middleware.ts`
    - Read `X-Request-ID` header from incoming request; fall back to `randomUUID()` from Node's `crypto` module
    - Assign the value to `req.requestId`
    - Set `X-Request-ID` response header before calling `next()`
    - _Requirements: 1.1, 1.2, 2.1, 2.2_
  - [ ] 2.2 Register `requestIdMiddleware` in `apps/api/src/app.ts` before all route handlers
    - Place it after body-parsing and sanitization middleware, before any `app.use('/api/...')` route registration
    - _Requirements: 1.3_
  - [ ]* 2.3 Write property test for `requestIdMiddleware` — Property 1: Request ID round-trip
    - **Property 1: For any arbitrary string used as `X-Request-ID`, the middleware echoes it unchanged in the response header**
    - **Validates: Requirements 1.1, 2.1**
  - [ ]* 2.4 Write property test for `requestIdMiddleware` — Property 2: Generated ID is a valid UUID v4
    - **Property 2: For any request without the header, the generated value matches the UUID v4 regex**
    - **Validates: Requirements 1.2, 2.1**
  - [ ]* 2.5 Write property test for `requestIdMiddleware` — Property 3: Response always carries X-Request-ID
    - **Property 3: For any HTTP request to the API (success or error path), the response must include a non-empty `X-Request-ID` header**
    - **Validates: Requirements 2.1, 2.2**

- [ ] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Update `StellarClient` to forward the request ID
  - [ ] 4.1 Add optional `requestId` parameter to `verifyTransaction` and `healthCheck` in `apps/api/src/modules/payments/services/stellar-client.ts`
    - When `requestId` is provided, include `X-Request-ID` header on the outbound Axios request
    - When `requestId` is `undefined`, omit the header entirely
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ] 4.2 Update call sites in `apps/api/src/modules/payments/payments.controller.ts` to pass `req.requestId` to `verifyTransaction`
    - _Requirements: 6.1, 6.3_
  - [ ]* 4.3 Write property test for `StellarClient` — Property 5: StellarClient forwards requestId
    - **Property 5: For any non-empty `requestId`, `StellarClient` always sets the outbound `X-Request-ID` header to that value**
    - **Validates: Requirements 4.1, 4.2**
  - [ ]* 4.4 Write property test for `StellarClient` — Property 6: StellarClient omits header when no requestId
    - **Property 6: For any call with `requestId = undefined`, `StellarClient` never sets the outbound `X-Request-ID` header**
    - **Validates: Requirements 4.3**

- [ ] 5. Add child-logger usage in the payments controller
  - In `apps/api/src/modules/payments/payments.controller.ts`, create a pino child logger bound to `req.requestId` for each request handler and use it for all log calls within that handler
  - _Requirements: 3.1, 3.2, 6.3_
  - [ ]* 5.1 Write property test for log entries — Property 4: Log entries contain requestId
    - **Property 4: For any request processed by the API, every structured log entry emitted during that request's lifecycle must contain a `requestId` field equal to `req.requestId`**
    - **Validates: Requirements 3.1, 3.2**

- [ ] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Adopt pino in stellar-service and log the forwarded request ID
  - [ ] 7.1 Create `apps/stellar-service/src/logger.ts` with a pino logger instance
    - Mirror the API logger pattern: `pino-pretty` in dev, plain JSON in production
    - _Requirements: 5.3_
  - [ ] 7.2 Add a per-request middleware in `apps/stellar-service/src/index.ts` that reads `X-Request-ID` and attaches a child logger to `req.log`
    - When header is present, create `logger.child({ requestId })`; otherwise use the base logger
    - _Requirements: 5.1, 5.2_
  - [ ] 7.3 Replace all `console.log` and `console.error` calls in `apps/stellar-service/src/index.ts` with the appropriate pino logger calls
    - Use `req.log` inside request handlers; use the module-level `logger` outside handlers (startup, shutdown)
    - _Requirements: 5.3, 6.2_
  - [ ]* 7.4 Write property test for stellar-service — Property 7: stellar-service logs received requestId
    - **Property 7: For any `X-Request-ID` header value received by stellar-service, the per-request child logger always includes it**
    - **Validates: Requirements 5.1, 6.2**
  - [ ]* 7.5 Write property test for stellar-service — Property 8: Payment operation uses same requestId end-to-end
    - **Property 8: For any payment confirmation request, the `requestId` logged by the API payments module and the `requestId` forwarded to stellar-service must be identical**
    - **Validates: Requirements 6.1, 6.3**

- [ ] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use **fast-check** with a minimum of 100 iterations per property
- Each task references specific requirements for traceability
- The error middleware already runs after `requestIdMiddleware`, so no changes to `error.middleware.ts` are needed
