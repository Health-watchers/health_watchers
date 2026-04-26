# Design Document: API Pagination Standardization

## Overview

This design standardizes pagination across all list endpoints in the API. The codebase currently has four inconsistent patterns:

1. **`paginate()` utility** (patients, patient sub-resources): returns `meta: { total, page, limit, totalPages }` — missing `hasNext`/`hasPrev`
2. **Manual skip/limit** (encounters, payments, notifications, appointments): returns either `meta: { total, page, limit }` or `pagination: { page, limit, total, pages }` — inconsistent key names and missing fields
3. **Unbounded arrays** (invoices, `GET /encounters/patient/:patientId`, `GET /patients/:id/prescriptions`, `GET /patients/:id/lab-results`, `GET /clinics`): no pagination at all
4. **Fixed `.limit(N)`** (dashboard, ICD-10 search): intentionally capped, not list endpoints

The solution is a single `Pagination_Middleware` + enhanced `Paginate_Utility` that all list endpoints use, producing a uniform `pagination` response key.

## Architecture

```mermaid
flowchart TD
    Client -->|GET /resource?page=2&limit=20&sort=createdAt_desc| Router
    Router --> PaginationMiddleware
    PaginationMiddleware -->|valid| ResLocals[res.locals.pagination]
    PaginationMiddleware -->|invalid| 400[400 ValidationError]
    ResLocals --> Controller
    Controller --> PaginateUtil[paginate() utility]
    PaginateUtil --> MongoDB
    MongoDB --> PaginateUtil
    PaginateUtil -->|PaginationMeta| Controller
    Controller -->|{ data, pagination }| Client
```

For cursor-based endpoints:

```mermaid
flowchart TD
    Client -->|GET /resource?cursor=base64id&limit=20| Router
    Router --> CursorMiddleware[Pagination Middleware - cursor mode]
    CursorMiddleware -->|valid cursor| Controller
    CursorMiddleware -->|invalid cursor| 400[400 ValidationError]
    Controller --> CursorUtil[paginateCursor() utility]
    CursorUtil -->|_id > decodedCursor| MongoDB
    MongoDB --> CursorUtil
    CursorUtil -->|{ data, nextCursor, hasMore }| Controller
    Controller -->|{ data, nextCursor, hasMore }| Client
```

## Components and Interfaces

### Pagination Middleware (`apps/api/src/middlewares/pagination.middleware.ts`)

```typescript
export interface ParsedPagination {
  page: number;       // >= 1
  limit: number;      // 1–100
  sort: Record<string, 1 | -1>;  // e.g. { createdAt: -1 }
  sortRaw: string;    // e.g. "createdAt_desc"
  cursor?: string;    // decoded cursor ID (if cursor mode)
}

export function paginationMiddleware(options?: {
  allowedSortFields?: string[];
  defaultSort?: string;           // default: "createdAt_desc"
  allowCursor?: boolean;          // default: false
}): RequestHandler
```

Behavior:
- Parses `page`, `limit`, `sort`, and optionally `cursor` from `req.query`
- Validates all values; returns 400 on any violation
- Attaches `ParsedPagination` to `res.locals.pagination`
- Calls `next()` on success

### Enhanced Paginate Utility (`apps/api/src/utils/paginate.ts`)

```typescript
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export async function paginate<T>(
  model: Model<T>,
  query: FilterQuery<T>,
  page: number,
  limit: number,
  sort?: Record<string, 1 | -1>
): Promise<{ data: T[]; pagination: PaginationMeta }>

export async function paginateCursor<T extends { _id: Types.ObjectId }>(
  model: Model<T>,
  query: FilterQuery<T>,
  limit: number,
  cursor?: string,
  sort?: Record<string, 1 | -1>
): Promise<{ data: T[]; nextCursor: string | null; hasMore: boolean }>
```

Key changes from current implementation:
- Return key renamed from `meta` to `pagination`
- `PaginationMeta` gains `hasNext` and `hasPrev`
- New `paginateCursor()` function for keyset pagination

### Standard Response Shapes

**Offset pagination response:**
```json
{
  "status": "success",
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": true
  }
}
```

**Cursor pagination response:**
```json
{
  "status": "success",
  "data": [...],
  "nextCursor": "NjQ3YWJjZGVmMTIzNDU2Nzg5MGFiY2Q=",
  "hasMore": true
}
```

**Validation error response:**
```json
{
  "error": "ValidationError",
  "message": "limit must be between 1 and 100"
}
```

## Data Models

### ParsedPagination (attached to res.locals)

| Field | Type | Description |
|-------|------|-------------|
| `page` | `number` | Current page, >= 1 |
| `limit` | `number` | Items per page, 1–100 |
| `sort` | `Record<string, 1 \| -1>` | Mongoose sort object |
| `sortRaw` | `string` | Original sort string, e.g. `createdAt_desc` |
| `cursor` | `string \| undefined` | Decoded cursor ID for cursor-mode endpoints |

### PaginationMeta (returned in responses)

| Field | Type | Description |
|-------|------|-------------|
| `page` | `number` | Current page |
| `limit` | `number` | Items per page |
| `total` | `number` | Total matching documents |
| `totalPages` | `number` | `Math.ceil(total / limit)` |
| `hasNext` | `boolean` | `page < totalPages` |
| `hasPrev` | `boolean` | `page > 1` |

### Endpoint Inventory and Migration Plan

| Endpoint | Current State | Migration |
|----------|--------------|-----------|
| `GET /patients` | `paginate()` → `meta` key | rename `meta` → `pagination`, add `hasNext`/`hasPrev` |
| `GET /patients/search` | `paginate()` → `meta` key | same as above |
| `GET /patients/:id/payments` | `paginate()` → `meta` key | same as above |
| `GET /patients/:id/encounters` | `paginate()` → `meta` key | same as above |
| `GET /patients/:id/prescriptions` | unbounded array | add pagination middleware + paginate() |
| `GET /patients/:id/lab-results` | unbounded array, manual sort | add pagination middleware + paginate() |
| `GET /encounters` | manual skip/limit → `meta` key | use paginate(), rename to `pagination` |
| `GET /encounters/patient/:patientId` | unbounded array | add pagination middleware + paginate() |
| `GET /payments` | manual skip/limit → `meta` key | use paginate(), rename to `pagination` |
| `GET /invoices` | unbounded array | add pagination middleware + paginate() |
| `GET /appointments` | manual skip/limit → `pagination` key (non-standard fields) | use paginate(), standardize fields |
| `GET /notifications` | manual skip/limit → `pagination` key (non-standard fields) | use paginate(), standardize fields |
| `GET /audit-logs` | `parsePagination()` → manual, no `pagination` key | use paginate(), add `pagination` key |
| `GET /clinics` | unbounded array (SUPER_ADMIN) | add pagination middleware + paginate() |
| `GET /clinics/:id/users` | manual skip/limit, no standard key | use paginate(), add `pagination` key |
| `GET /users` | manual skip/limit, no standard key | use paginate(), add `pagination` key |

**High-volume endpoints (cursor-based):**
- `GET /patients` — patient collection can exceed 10k per clinic
- `GET /encounters` — encounter collection can exceed 10k per clinic
- `GET /audit-logs` — audit log collection grows unboundedly

These endpoints will support both offset and cursor pagination. When `cursor` is provided, cursor mode is used; otherwise offset mode applies.

### Allowed Sort Fields Per Endpoint

| Endpoint | Allowed Sort Fields |
|----------|-------------------|
| `GET /patients` | `createdAt`, `lastName`, `firstName`, `dateOfBirth` |
| `GET /patients/search` | `createdAt`, `lastName`, `firstName` |
| `GET /encounters` | `createdAt`, `updatedAt` |
| `GET /encounters/patient/:patientId` | `createdAt` |
| `GET /payments` | `createdAt`, `amount` |
| `GET /invoices` | `createdAt`, `dueDate`, `total` |
| `GET /appointments` | `scheduledAt`, `createdAt` |
| `GET /notifications` | `createdAt` |
| `GET /audit-logs` | `timestamp` |
| `GET /clinics` | `createdAt`, `name` |
| `GET /clinics/:id/users` | `createdAt`, `lastName` |
| `GET /users` | `createdAt`, `lastName` |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Page and limit validation rejects out-of-range values

*For any* `page` value less than 1 or any `limit` value outside the range [1, 100], the pagination middleware should return a 400 response with a `ValidationError` error code, and for any values within the valid ranges, the middleware should accept them and attach them to `res.locals.pagination`.

**Validates: Requirements 1.1, 1.2, 3.1, 3.2, 3.3**

### Property 2: Sort parameter validation

*For any* `sort` string that does not match the `<field>_<direction>` format (where direction is `asc` or `desc`), or where the field is not in the endpoint's allowlist, the middleware should return a 400 response. For any valid sort string with an allowed field and valid direction, the middleware should parse it into a Mongoose sort object and attach it to `res.locals.pagination`.

**Validates: Requirements 1.3, 1.5, 3.4, 5.1**

### Property 3: Middleware attaches correct parsed values for valid inputs

*For any* valid combination of `page`, `limit`, and `sort` query parameters, the pagination middleware should attach exactly those parsed values to `res.locals.pagination` and call `next()` without sending a response.

**Validates: Requirements 3.5, 4.2**

### Property 4: All list endpoint responses contain the required pagination structure

*For any* list endpoint response, the response body should contain a `data` array and a `pagination` object with all six required fields: `page`, `limit`, `total`, `totalPages`, `hasNext`, and `hasPrev`.

**Validates: Requirements 2.1, 2.2**

### Property 5: Pagination math invariants

*For any* `total`, `page`, and `limit` values, the computed `PaginationMeta` should satisfy: `totalPages === Math.ceil(total / limit)`, `hasNext === (page < totalPages)`, and `hasPrev === (page > 1)`.

**Validates: Requirements 2.3, 2.4, 2.5, 4.3**

### Property 6: Sort ordering is applied correctly

*For any* list endpoint with a valid `sort` parameter, the items in the `data` array should be ordered according to the specified field and direction (ascending or descending).

**Validates: Requirements 5.1**

### Property 7: Cursor response structure

*For any* cursor-mode list endpoint response, the response body should contain `data`, `nextCursor`, and `hasMore` fields, and should not contain a `pagination` object.

**Validates: Requirements 6.3**

### Property 8: hasMore and nextCursor invariant

*For any* cursor pagination response, `hasMore === true` implies `nextCursor` is a non-null string, and `hasMore === false` implies `nextCursor` is `null`.

**Validates: Requirements 6.4, 6.5**

### Property 9: Cursor pagination returns only documents after the cursor

*For any* cursor value representing a document ID, all documents returned in the response should have sort-key values strictly after the cursor document's sort-key value in the specified sort order.

**Validates: Requirements 6.2**

### Property 10: Invalid cursor returns 400

*For any* malformed cursor string (not valid base64, or decoding to an invalid ObjectId), the endpoint should return a 400 response with a `ValidationError` error code.

**Validates: Requirements 6.6**

### Property 11: Absent cursor falls back to offset pagination

*For any* cursor-capable endpoint called without a `cursor` parameter, the response should have the standard offset pagination shape (`data` + `pagination` object) rather than the cursor shape.

**Validates: Requirements 6.7**

## Error Handling

| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| `page` < 1 | 400 | `ValidationError` | `page must be a positive integer` |
| `page` is non-integer | 400 | `ValidationError` | `page must be a positive integer` |
| `limit` < 1 | 400 | `ValidationError` | `limit must be between 1 and 100` |
| `limit` > 100 | 400 | `ValidationError` | `limit must not exceed 100` |
| `sort` wrong format | 400 | `ValidationError` | `sort must be in format <field>_<asc\|desc>` |
| `sort` field not allowed | 400 | `ValidationError` | `sort field '<field>' is not allowed. Allowed: <list>` |
| `cursor` malformed | 400 | `ValidationError` | `cursor is invalid or malformed` |

All validation errors are returned before the controller handler runs, so no database queries are made for invalid requests.

## Testing Strategy

### Unit Tests

Unit tests cover specific examples and edge cases:
- Middleware with boundary values (`page=1`, `limit=1`, `limit=100`)
- Middleware with invalid values (`page=0`, `limit=101`, `limit=-1`)
- `paginate()` utility with zero results (`total=0`)
- `paginate()` utility on the last page (`page === totalPages`)
- `paginateCursor()` with no cursor (first page)
- `paginateCursor()` with a cursor pointing to the last document
- Sort parsing: `createdAt_asc` → `{ createdAt: 1 }`, `lastName_desc` → `{ lastName: -1 }`

### Property-Based Tests

Property tests use [fast-check](https://github.com/dubzzz/fast-check) and run a minimum of 100 iterations each.

Each property test is tagged with:
**Feature: api-pagination-standardization, Property N: <property_text>**

- **Property 1**: Generate random `page` and `limit` values; verify acceptance/rejection matches the valid range
- **Property 2**: Generate random sort strings; verify valid ones are parsed correctly and invalid ones return 400
- **Property 3**: Generate valid pagination inputs; verify `res.locals.pagination` is populated correctly
- **Property 4**: Generate random datasets and page requests; verify all responses contain the required structure
- **Property 5**: Generate random `total`/`page`/`limit` triples; verify `totalPages`, `hasNext`, `hasPrev` are computed correctly
- **Property 6**: Generate random datasets with a sort parameter; verify result ordering
- **Property 7**: Generate cursor requests; verify response shape
- **Property 8**: Generate cursor responses; verify `hasMore`/`nextCursor` invariant
- **Property 9**: Generate datasets and cursor values; verify only post-cursor documents are returned
- **Property 10**: Generate malformed cursor strings; verify 400 is returned
- **Property 11**: Generate requests without cursor; verify offset pagination shape is returned
