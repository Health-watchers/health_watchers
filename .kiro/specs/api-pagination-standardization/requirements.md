# Requirements Document

## Introduction

This feature standardizes pagination across all list endpoints in the API. Currently, the codebase has inconsistent pagination implementations: some endpoints use a `paginate()` utility returning `meta: { total, page, limit, totalPages }`, others manually compute skip/limit returning `meta: { total, page, limit }` (missing `totalPages`), some use a `pagination` key instead of `meta`, and some list endpoints (e.g., `GET /invoices`, `GET /encounters/patient/:patientId`, `GET /patients/:id/prescriptions`, `GET /patients/:id/lab-results`, `GET /clinics`) return unbounded arrays with no pagination at all. The goal is a single, consistent pagination contract across all list endpoints, backed by a shared middleware and utility, with cursor-based pagination available for high-volume collections.

## Glossary

- **Pagination_Middleware**: Express middleware that parses, validates, and attaches pagination parameters to `res.locals`.
- **PaginationMeta**: The standard pagination metadata object returned in every paginated list response.
- **Offset_Pagination**: Page/limit-based pagination using `page` and `limit` query parameters.
- **Cursor_Pagination**: Keyset-based pagination using an opaque `cursor` parameter for high-volume collections.
- **List_Endpoint**: Any API route that returns an array of resources (e.g., `GET /patients`, `GET /encounters`, `GET /invoices`).
- **Sort_Parameter**: A query parameter of the form `<field>_<direction>` (e.g., `createdAt_desc`) that controls result ordering.
- **High_Volume_Collection**: A MongoDB collection expected to exceed 10,000 documents (currently: patients, encounters, audit logs).
- **Paginate_Utility**: The shared `paginate()` function in `apps/api/src/utils/paginate.ts`.

## Requirements

### Requirement 1: Standard Pagination Query Parameters

**User Story:** As an API client developer, I want all list endpoints to accept the same pagination query parameters, so that I can implement a single pagination strategy across the entire application.

#### Acceptance Criteria

1. THE Pagination_Middleware SHALL accept a `page` query parameter as a positive integer with a default value of 1 and a minimum value of 1.
2. THE Pagination_Middleware SHALL accept a `limit` query parameter as a positive integer with a default value of 20, a minimum value of 1, and a maximum value of 100.
3. THE Pagination_Middleware SHALL accept a `sort` query parameter in the format `<field>_<direction>` where direction is either `asc` or `desc`.
4. WHEN the `sort` parameter is omitted, THE Pagination_Middleware SHALL apply a default sort of `createdAt_desc`.
5. WHEN the `sort` parameter references a field not in the endpoint's allowed sort fields, THE Pagination_Middleware SHALL return a 400 response with a descriptive error message.

### Requirement 2: Standard Pagination Response Format

**User Story:** As an API client developer, I want all list endpoints to return the same pagination metadata structure, so that I can build reusable pagination UI components.

#### Acceptance Criteria

1. THE List_Endpoint SHALL return a response body containing a `data` array of resource objects.
2. THE List_Endpoint SHALL return a response body containing a `pagination` object with the fields: `page`, `limit`, `total`, `totalPages`, `hasNext`, and `hasPrev`.
3. THE List_Endpoint SHALL compute `totalPages` as `Math.ceil(total / limit)`.
4. THE List_Endpoint SHALL compute `hasNext` as `true` when `page < totalPages`, and `false` otherwise.
5. THE List_Endpoint SHALL compute `hasPrev` as `true` when `page > 1`, and `false` otherwise.
6. WHEN a list endpoint currently returns a `meta` key instead of `pagination`, THE List_Endpoint SHALL be updated to use the `pagination` key with the full standard fields.

### Requirement 3: Input Validation and Error Responses

**User Story:** As an API client developer, I want clear error messages when I provide invalid pagination parameters, so that I can quickly diagnose and fix integration issues.

#### Acceptance Criteria

1. WHEN the `page` parameter is less than 1 or is not a valid integer, THE Pagination_Middleware SHALL return a 400 response with the error code `ValidationError` and a message identifying the invalid field.
2. WHEN the `limit` parameter is less than 1, THE Pagination_Middleware SHALL return a 400 response with the error code `ValidationError` and a message identifying the invalid field.
3. WHEN the `limit` parameter exceeds 100, THE Pagination_Middleware SHALL return a 400 response with the error code `ValidationError` and a message stating the maximum allowed value.
4. WHEN the `sort` parameter does not match the `<field>_<direction>` format, THE Pagination_Middleware SHALL return a 400 response with the error code `ValidationError` and a message describing the expected format.
5. WHEN pagination parameters are valid, THE Pagination_Middleware SHALL attach the parsed `page`, `limit`, and `sort` values to `res.locals.pagination` and call `next()`.

### Requirement 4: Pagination Middleware Applied to All List Endpoints

**User Story:** As a backend developer, I want a single reusable pagination middleware, so that I do not have to duplicate validation logic across every list endpoint.

#### Acceptance Criteria

1. THE Pagination_Middleware SHALL be applied to all List_Endpoints that return collections of resources.
2. WHEN the Pagination_Middleware is applied, THE List_Endpoint SHALL read pagination parameters from `res.locals.pagination` rather than parsing `req.query` directly.
3. THE Paginate_Utility SHALL be updated to include `hasNext` and `hasPrev` in the returned `PaginationMeta` object.
4. THE Paginate_Utility SHALL accept a `sort` parameter derived from the parsed Sort_Parameter.
5. WHEN a List_Endpoint previously had no pagination (e.g., `GET /invoices`, `GET /encounters/patient/:patientId`, `GET /patients/:id/prescriptions`, `GET /patients/:id/lab-results`, `GET /clinics`), THE List_Endpoint SHALL be updated to use the Pagination_Middleware and return paginated results.

### Requirement 5: Sort Parameter Support

**User Story:** As an API client developer, I want to sort list results by relevant fields, so that I can display data in the order most useful to the user.

#### Acceptance Criteria

1. WHEN a `sort` query parameter is provided, THE List_Endpoint SHALL apply the specified sort order to the database query.
2. THE List_Endpoint SHALL define an allowlist of sortable fields per endpoint (e.g., `createdAt`, `updatedAt`, `lastName` for patients).
3. WHEN the `sort` field is not in the endpoint's allowlist, THE Pagination_Middleware SHALL return a 400 response with a descriptive error listing the allowed fields.
4. WHEN the `sort` direction is neither `asc` nor `desc`, THE Pagination_Middleware SHALL return a 400 response with a descriptive error.

### Requirement 6: Cursor-Based Pagination for High-Volume Endpoints

**User Story:** As an API client developer, I want cursor-based pagination on high-volume endpoints, so that I can efficiently page through large datasets without performance degradation from deep offset queries.

#### Acceptance Criteria

1. WHEN a List_Endpoint is designated as a High_Volume_Collection endpoint, THE List_Endpoint SHALL support a `cursor` query parameter containing a base64-encoded document ID representing the last item seen.
2. WHEN a valid `cursor` is provided, THE List_Endpoint SHALL return only documents that come after the cursor document in the specified sort order.
3. WHEN a valid `cursor` is provided, THE List_Endpoint SHALL return a response containing `data`, `nextCursor`, and `hasMore` instead of the standard `pagination` object.
4. WHEN `hasMore` is `true`, THE List_Endpoint SHALL include a `nextCursor` value that is the base64-encoded ID of the last item in the current result set.
5. WHEN `hasMore` is `false`, THE List_Endpoint SHALL set `nextCursor` to `null`.
6. WHEN an invalid or malformed `cursor` is provided, THE List_Endpoint SHALL return a 400 response with the error code `ValidationError` and a descriptive message.
7. WHEN the `cursor` parameter is absent, THE List_Endpoint SHALL fall back to standard Offset_Pagination behavior.

### Requirement 7: Backward Compatibility

**User Story:** As an existing API client developer, I want the pagination changes to be non-breaking where possible, so that I do not have to update all clients simultaneously.

#### Acceptance Criteria

1. WHEN an existing endpoint previously returned a `meta` key, THE List_Endpoint SHALL continue to include the same fields (`total`, `page`, `limit`) within the new `pagination` key so that clients reading those fields still work.
2. THE List_Endpoint SHALL add `totalPages`, `hasNext`, and `hasPrev` as new fields within the `pagination` key.
3. WHEN an endpoint previously returned an unbounded array with no pagination, THE List_Endpoint SHALL now return paginated results with the standard `pagination` key, which is a non-breaking addition for clients that only read the `data` array.
