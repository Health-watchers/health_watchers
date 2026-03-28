# Requirements Document

## Introduction

This feature adds end-to-end request ID propagation across the API and stellar-service. Every inbound HTTP request to the API is assigned a unique identifier (read from the `X-Request-ID` header or generated as a UUID v4). That ID is attached to the Express `Request` object, included in all log output, forwarded to the stellar-service on outbound calls, and returned to the caller in every API response. The stellar-service reads the forwarded header and includes the ID in its own log output, enabling full distributed tracing for payment operations.

## Glossary

- **API**: The Express application in `apps/api/src/app.ts`
- **Stellar_Service**: The Express application in `apps/stellar-service/src/index.ts`
- **Request_ID_Middleware**: The Express middleware responsible for reading or generating the request ID
- **Stellar_Client**: The Axios-based HTTP client in `apps/api/src/modules/payments/services/stellar-client.ts` that calls the Stellar_Service
- **X-Request-ID**: The HTTP header used to carry the request identifier between services and back to the caller
- **UUID**: A universally unique identifier in v4 format (e.g. `550e8400-e29b-41d4-a716-446655440000`)

## Requirements

### Requirement 1: Request ID Assignment

**User Story:** As a platform engineer, I want every API request to carry a unique identifier, so that I can correlate log entries and trace requests across services.

#### Acceptance Criteria

1. WHEN a request arrives at the API with an `X-Request-ID` header present, THE Request_ID_Middleware SHALL attach the header value to the Express `Request` object as `req.requestId`.
2. WHEN a request arrives at the API without an `X-Request-ID` header, THE Request_ID_Middleware SHALL generate a UUID v4 and attach it to the Express `Request` object as `req.requestId`.
3. THE Request_ID_Middleware SHALL be registered in the API before any route handler.
4. THE API SHALL extend the Express `Request` type declaration to include a `requestId` property of type `string`.

---

### Requirement 2: Request ID in API Responses

**User Story:** As an API consumer, I want the `X-Request-ID` header returned in every response, so that I can correlate my requests with server-side logs.

#### Acceptance Criteria

1. WHEN the API sends any HTTP response, THE Request_ID_Middleware SHALL set the `X-Request-ID` response header to the value of `req.requestId`.
2. THE Request_ID_Middleware SHALL set the response header before the response is sent, regardless of whether the response is a success or an error.

---

### Requirement 3: Request ID in API Log Output

**User Story:** As a platform engineer, I want the request ID included in every API log entry, so that I can filter and correlate log lines for a single request.

#### Acceptance Criteria

1. WHEN the API emits a log entry during request processing, THE API SHALL include the `requestId` field in the log entry.
2. THE API SHALL use the pino logger's child-logger pattern to bind `requestId` to all log calls within the scope of a request.

---

### Requirement 4: Request ID Forwarded to Stellar Service

**User Story:** As a platform engineer, I want the request ID forwarded to the stellar-service on outbound calls, so that I can trace a payment operation across both services.

#### Acceptance Criteria

1. WHEN the Stellar_Client makes an HTTP request to the Stellar_Service, THE Stellar_Client SHALL include the `X-Request-ID` header set to the originating request's `requestId`.
2. THE Stellar_Client SHALL accept the `requestId` as a parameter on each method that calls the Stellar_Service (`verifyTransaction`, `healthCheck`).
3. IF no `requestId` is provided to the Stellar_Client, THEN THE Stellar_Client SHALL omit the `X-Request-ID` header from the outbound request.

---

### Requirement 5: Request ID in Stellar Service Log Output

**User Story:** As a platform engineer, I want the stellar-service to log the forwarded request ID, so that I can correlate stellar-service log entries with the originating API request.

#### Acceptance Criteria

1. WHEN the Stellar_Service receives a request containing an `X-Request-ID` header, THE Stellar_Service SHALL include the header value in all log output for that request.
2. WHEN the Stellar_Service receives a request without an `X-Request-ID` header, THE Stellar_Service SHALL log the request without a `requestId` field.
3. THE Stellar_Service SHALL use a structured logger (pino) to emit log entries, replacing the existing `console.log` and `console.error` calls.

---

### Requirement 6: Consistency Across Payment Operations

**User Story:** As a platform engineer, I want the same request ID to appear in both API and stellar-service logs for a single payment operation, so that I can reconstruct the full execution path.

#### Acceptance Criteria

1. WHEN a payment operation triggers a call from the API to the Stellar_Service, THE API SHALL pass the same `requestId` that was assigned in Requirement 1 to the Stellar_Client.
2. WHEN the Stellar_Service processes the forwarded request, THE Stellar_Service SHALL log the received `X-Request-ID` value unchanged.
3. THE API SHALL include the `requestId` in log entries emitted by the payments module for the same request.
