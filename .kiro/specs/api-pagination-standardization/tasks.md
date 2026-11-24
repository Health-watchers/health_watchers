# Implementation Plan: API Pagination Standardization

## Overview

Implement a shared pagination middleware and enhanced paginate utility, then migrate all list endpoints to use them, producing a uniform `pagination` response key with `hasNext`/`hasPrev`. Add cursor-based pagination for high-volume endpoints.

**Final `paginate()` return shape:**

```ts
{
  data: T[],
  pagination: {
    total: number,
    page: number,
    limit: number,
    totalPages: number,
    hasNext: boolean,
    hasPrev: boolean,
    nextCursor?: string,
  },
}
```

All migrated list endpoints return this shape (cursor-capable endpoints return `{ data, nextCursor, hasMore }` when a cursor is supplied).

## Tasks

- [x] 1. Enhance the paginate utility
  - [x] 1.1 Update `PaginationMeta` interface in `apps/api/src/utils/paginate.ts` to add `hasNext` and `hasPrev` boolean fields
    - Update the `paginate()` return type to use `pagination` key instead of `meta`
    - Compute `hasNext = page < totalPages` and `hasPrev = page > 1` in the returned object
    - Add `paginateCursor<T>()` function that accepts `model`, `query`, `limit`, `cursor?`, and `sort?`; returns `{ data, nextCursor, hasMore }`
    - Cursor encoding/decoding: `Buffer.from(id).toString('base64')` / `Buffer.from(cursor, 'base64').toString()`
    - _Requirements: 2.3, 2.4, 2.5, 4.3, 6.2, 6.4, 6.5_

  - [ ]* 1.2 Write property test for paginate utility math invariants
    - **Property 5: Pagination math invariants**
    - **Validates: Requirements 2.3, 2.4, 2.5, 4.3**
    - Use fast-check to generate random `total`, `page`, `limit` triples and verify `totalPages`, `hasNext`, `hasPrev`
    - Tag: `Feature: api-pagination-standardization, Property 5`

  - [ ]* 1.3 Write property test for paginateCursor hasMore/nextCursor invariant
    - **Property 8: hasMore and nextCursor invariant**
    - **Validates: Requirements 6.4, 6.5**
    - Tag: `Feature: api-pagination-standardization, Property 8`

- [x] 2. Create the pagination middleware
  - [x] 2.1 Create `apps/api/src/middlewares/pagination.middleware.ts`
    - Export `ParsedPagination` interface with `page`, `limit`, `sort`, `sortRaw`, and optional `cursor` fields
    - Export `paginationMiddleware(options?)` factory that returns an Express `RequestHandler`
    - Options: `allowedSortFields?: string[]`, `defaultSort?: string` (default `"createdAt_desc"`), `allowCursor?: boolean`
    - Parse and coerce `page` (default 1, min 1) and `limit` (default 20, min 1, max 100) from `req.query`
    - Parse `sort` string into Mongoose sort object; validate format and field allowlist
    - If `allowCursor` is true, parse and base64-decode `cursor` from `req.query`; validate it is a valid ObjectId
    - On any validation failure return `res.status(400).json({ error: 'ValidationError', message: '...' })`
    - On success attach `ParsedPagination` to `res.locals.pagination` and call `next()`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 6.1, 6.6_

  - [ ]* 2.2 Write property test for page/limit validation
    - **Property 1: Page and limit validation rejects out-of-range values**
    - **Validates: Requirements 1.1, 1.2, 3.1, 3.2, 3.3**
    - Use fast-check to generate integers; verify values in [1,100] are accepted and values outside are rejected with 400
    - Tag: `Feature: api-pagination-standardization, Property 1`

  - [ ]* 2.3 Write property test for sort parameter validation
    - **Property 2: Sort parameter validation**
    - **Validates: Requirements 1.3, 1.5, 3.4, 5.1**
    - Use fast-check to generate sort strings; verify valid `<field>_<asc|desc>` strings with allowed fields are accepted and others return 400
    - Tag: `Feature: api-pagination-standardization, Property 2`

  - [ ]* 2.4 Write property test for middleware attaching correct parsed values
    - **Property 3: Middleware attaches correct parsed values for valid inputs**
    - **Validates: Requirements 3.5, 4.2**
    - Use fast-check to generate valid `page`/`limit`/`sort` combinations; verify `res.locals.pagination` matches
    - Tag: `Feature: api-pagination-standardization, Property 3`

  - [ ]* 2.5 Write property test for invalid cursor returning 400
    - **Property 10: Invalid cursor returns 400**
    - **Validates: Requirements 6.6**
    - Use fast-check to generate malformed base64 strings and invalid ObjectIds; verify 400 is returned
    - Tag: `Feature: api-pagination-standardization, Property 10`

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Migrate endpoints that already use paginate() or manual skip/limit
  - [x] 4.1 Update `GET /patients` and `GET /patients/search` in `patients.controller.ts`
    - Replace `parsePagination()` call with `paginationMiddleware({ allowedSortFields: ['createdAt','lastName','firstName','dateOfBirth'], allowCursor: true })` in the route chain
    - Read `res.locals.pagination` instead of calling `parsePagination()`
    - Pass `sort` from `res.locals.pagination` to `paginate()` / `paginateCursor()`
    - Return `pagination` key (from `paginate()`) or `{ nextCursor, hasMore }` (from `paginateCursor()`)
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 4.1, 4.2, 6.1, 6.7_

  - [x] 4.2 Update `GET /patients/:id/payments` and `GET /patients/:id/encounters` in `patients.controller.ts`
    - Replace `parsePagination()` with `paginationMiddleware({ allowedSortFields: ['createdAt'] })`
    - Return `pagination` key from `paginate()`
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 4.1, 4.2_

  - [x] 4.3 Update `GET /encounters` in `encounters.controller.ts`
    - Replace manual `skip`/`limit` with `paginationMiddleware({ allowedSortFields: ['createdAt','updatedAt'], allowCursor: true })`
    - Use `paginate()` or `paginateCursor()` based on whether cursor is present
    - Return `pagination` key
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 4.1, 4.2, 6.1, 6.7_

  - [x] 4.4 Update `GET /payments` in `payments.controller.ts`
    - Replace manual `skip`/`limit` with `paginationMiddleware({ allowedSortFields: ['createdAt','amount'] })`
    - Use `paginate()` and return `pagination` key
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 4.1, 4.2_

  - [x] 4.5 Update `GET /appointments` in `appointments.controller.ts`
    - Replace manual `skip`/`limit` with `paginationMiddleware({ allowedSortFields: ['scheduledAt','createdAt'] })`
    - Use `paginate()` and return `pagination` key (currently returns non-standard `pages` field instead of `totalPages`)
    - _Requirements: 2.2, 2.6, 4.1, 4.2_

  - [x] 4.6 Update `GET /notifications` in `notifications.controller.ts`
    - Replace manual `skip`/`limit` with `paginationMiddleware({ allowedSortFields: ['createdAt'] })`
    - Use `paginate()` and return `pagination` key (currently returns non-standard `pages` field)
    - _Requirements: 2.2, 2.6, 4.1, 4.2_

  - [x] 4.7 Update `GET /audit-logs` in `audit-logs.controller.ts`
    - Replace `parsePagination()` with `paginationMiddleware({ allowedSortFields: ['timestamp'], allowCursor: true })`
    - Use `paginate()` or `paginateCursor()` and return `pagination` key
    - _Requirements: 2.2, 4.1, 4.2, 6.1_

  - [x] 4.8 Update `GET /clinics/:id/users` in `clinics.controller.ts` and `GET /users` in `user-management.controller.ts`
    - Replace manual `skip`/`limit` with `paginationMiddleware({ allowedSortFields: ['createdAt','lastName'] })`
    - Use `paginate()` and return `pagination` key
    - _Requirements: 2.2, 4.1, 4.2_

- [x] 5. Add pagination to currently unbounded list endpoints
  - [x] 5.1 Update `GET /invoices` in `invoices.controller.ts`
    - Add `paginationMiddleware({ allowedSortFields: ['createdAt','dueDate','total'] })` to the route
    - Replace `InvoiceModel.find(...).lean()` with `paginate()` call using `res.locals.pagination`
    - Return `pagination` key
    - _Requirements: 4.5, 2.1, 2.2_

  - [x] 5.2 Update `GET /encounters/patient/:patientId` in `encounters.controller.ts`
    - Add `paginationMiddleware({ allowedSortFields: ['createdAt'] })` to the route
    - Replace unbounded `EncounterModel.find(...).sort(...)` with `paginate()` call
    - Return `pagination` key
    - _Requirements: 4.5, 2.1, 2.2_

  - [x] 5.3 Update `GET /patients/:id/prescriptions` in `patients.controller.ts`
    - Add `paginationMiddleware({ allowedSortFields: ['createdAt'] })` to the route
    - Paginate the encounter query and flatten prescriptions within the page window
    - Return `pagination` key with total count of prescriptions
    - _Requirements: 4.5, 2.1, 2.2_

  - [x] 5.4 Update `GET /patients/:id/lab-results` in `patients.controller.ts`
    - Add `paginationMiddleware({ allowedSortFields: ['orderedAt','testName'] })` to the route
    - Replace unbounded `LabResultModel.find(...)` with `paginate()` call
    - Return `pagination` key
    - _Requirements: 4.5, 2.1, 2.2_

  - [x] 5.5 Update `GET /clinics` in `clinics.controller.ts`
    - Add `paginationMiddleware({ allowedSortFields: ['createdAt','name'] })` to the route
    - Replace unbounded `ClinicModel.find()` with `paginate()` call
    - Return `pagination` key
    - _Requirements: 4.5, 2.1, 2.2_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6a. Integration tests for boundary conditions
  - [x] 6a.1 Add integration tests covering empty result sets (total = 0, `data: []`, `hasNext = false`, `hasPrev = false`)
  - [x] 6a.2 Add integration tests covering single-page result sets (`hasNext = false`, `hasPrev = false`, `totalPages = 1`)
  - [x] 6a.3 Add integration tests covering last-page result sets (`hasNext = false`, `hasPrev = true`, correct partial page length)
  - [x] 6a.4 Add integration tests covering out-of-range pages (empty `data`, correct `total`/`totalPages`)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 6b. Update API documentation
  - [x] 6b.1 Update OpenAPI spec to document the shared `pagination` schema (`total`, `page`, `limit`, `totalPages`, `hasNext`, `hasPrev`, `nextCursor`) and apply it to all migrated list endpoints
  - [x] 6b.2 Update Postman collection to reflect the new response schema and query parameters (`page`, `limit`, `sort`, `cursor`)
  - [x] 6b.3 Write migration guide for API consumers (mapping `meta.*` → `pagination.*`, `pages` → `totalPages`, and adoption of `cursor`/`nextCursor`)

- [ ] 7. Property-based tests for response structure and cursor correctness
  - [ ]* 7.1 Write property test for list endpoint response structure
    - **Property 4: All list endpoint responses contain the required pagination structure**
    - **Validates: Requirements 2.1, 2.2**
    - Use fast-check to generate random page/limit inputs; call each migrated endpoint and verify `data` array and `pagination` object with all 6 fields are present
    - Tag: `Feature: api-pagination-standardization, Property 4`

  - [ ]* 7.2 Write property test for sort ordering correctness
    - **Property 6: Sort ordering is applied correctly**
    - **Validates: Requirements 5.1**
    - Use fast-check to generate datasets and sort parameters; verify returned `data` array is ordered correctly
    - Tag: `Feature: api-pagination-standardization, Property 6`

  - [ ]* 7.3 Write property test for cursor response structure
    - **Property 7: Cursor response structure**
    - **Validates: Requirements 6.3**
    - Use fast-check to generate cursor requests; verify response contains `data`, `nextCursor`, `hasMore` and no `pagination` key
    - Tag: `Feature: api-pagination-standardization, Property 7`

  - [ ]* 7.4 Write property test for cursor correctness
    - **Property 9: Cursor pagination returns only documents after the cursor**
    - **Validates: Requirements 6.2**
    - Use fast-check to generate datasets and cursor values; verify all returned documents come after the cursor document in sort order
    - Tag: `Feature: api-pagination-standardization, Property 9`

  - [ ]* 7.5 Write property test for absent cursor falling back to offset pagination
    - **Property 11: Absent cursor falls back to offset pagination**
    - **Validates: Requirements 6.7**
    - Use fast-check to generate requests without cursor to cursor-capable endpoints; verify offset pagination shape is returned
    - Tag: `Feature: api-pagination-standardization, Property 11`

- [ ] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Migrated Endpoints

The following list endpoints now return the standardized `{ data, pagination }` shape:

- Patients — `GET /patients`, `GET /patients/search`, `GET /patients/:id/payments`, `GET /patients/:id/encounters`, `GET /patients/:id/prescriptions`, `GET /patients/:id/lab-results`
- Encounters — `GET /encounters`, `GET /encounters/patient/:patientId`
- Appointments — `GET /appointments`
- Payments — `GET /payments`
- Invoices — `GET /invoices`
- Lab results — `GET /patients/:id/lab-results`
- Medications — `GET /patients/:id/prescriptions`
- Referrals — `GET /referrals`
- Notifications — `GET /notifications`

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- The `parsePagination()` function in `paginate.ts` can be removed once all callers are migrated to the middleware
- Backward compatibility: the `pagination` key is a superset of the old `meta` key — clients reading `meta.total`, `meta.page`, `meta.limit` will need to update to `pagination.*`, but the values are identical
- Endpoints that previously returned a non-standard `pages` field now return `pagination.totalPages`
- fast-check is the recommended property-based testing library (`npm install --save-dev fast-check`)
