# Migration Guide

## v1 → v2

API v1 is **deprecated**. v2 is the current version. v1 will continue to receive critical security fixes until its sunset date, but no new features will be added.

---

## What Changed in v2

### Base URL

| Version | Base URL |
|---------|---------|
| v1 (deprecated) | `/api/v1` |
| v2 (current)    | `/api/v2` |

No path segments changed — only the version prefix. All resource paths (`/patients`, `/encounters`, etc.) are identical.

### Deprecation Headers on v1

Every v1 response now includes:

```http
API-Version: 1.0
Deprecation: true
Sunset: 2025-06-01
Link: </api/v2>; rel="successor-version"
Warning: 299 - "API v1 is deprecated. Please migrate to v2. See /api/versions for details."
```

### Enhanced Error Format

v2 error responses always include `code` and `requestId`:

```json
{
  "error":     "ValidationError",
  "code":      "VALIDATION_ERROR",
  "message":   "Request validation failed.",
  "details":   [{ "path": "email", "message": "Invalid email" }],
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

v1 errors may omit `code` and `requestId` on some endpoints. Update any error-handling code that relies on the exact response shape.

### Real-time Events (v2 only)

Socket.IO events are available in v2:
- `appointment:confirmed`
- `appointment:cancelled`
- `appointment:rescheduled`
- `appointment:patient_arrived`

If your application uses polling for appointment status changes, migrate to Socket.IO with v2 to reduce load.

### Pagination Metadata

v2 list endpoints return a standardized pagination envelope. The legacy `meta` object has been replaced by a `pagination` object, and the response body now wraps the results in `data`:

```json
{
  "data": [ /* array of resources */ ],
  "pagination": {
    "total": 142,
    "page": 1,
    "limit": 20,
    "hasMore": true,
    "nextCursor": "eyJpZCI6IjY1ZjEuLi4ifQ=="
  }
}
```

v1 returned a bare array (or a `meta` object on some endpoints) with only `total`, `page`, and `limit`. See [Pagination Standardization](#pagination-standardization) below for the full contract and migration steps.

---

## Migration Steps

### Step 1 — Inventory your v1 usage

Run a search for `/api/v1` in your codebase:

```bash
# Find all v1 API references
grep -r "/api/v1" --include="*.ts" --include="*.js" --include="*.py" .
```

### Step 2 — Update the base URL

In your API client or environment config, change:

```diff
- HW_BASE_URL=https://api.healthwatchers.io/api/v1
+ HW_BASE_URL=https://api.healthwatchers.io/api/v2
```

### Step 3 — Update error handling

Add handling for the `code` field if you relied on the `error` string alone:

```typescript
// Before (v1 style)
if (err.error === 'Unauthorized') { ... }

// After (v2 style — prefer `code`)
if (err.code === 'INVALID_TOKEN' || err.code === 'UNAUTHORIZED') { ... }
```

### Step 4 — Update pagination logic

See [Pagination Standardization](#pagination-standardization) for the complete old → new mapping, query parameters, and a consumer checklist.

```typescript
// Before (v1 — bare array or `meta` object)
const res = await hw.patients.list({ page: 1, limit: 20 });
const items = Array.isArray(res) ? res : res.data;
const totalPages = Math.ceil(res.meta.total / res.meta.limit);

// After (v2 — standardized envelope)
const { data, pagination } = await hw.patients.list({ page: 1, limit: 20 });
const { total, page, limit, hasMore, nextCursor } = pagination;
```

### Step 5 — Adopt real-time events (optional but recommended)

Replace polling loops for appointment status with Socket.IO:

```typescript
// Before (polling every 5s)
setInterval(async () => {
  const appts = await hw.appointments.list({ status: 'confirmed' });
  updateUI(appts);
}, 5_000);

// After (v2 Socket.IO)
socket.on('appointment:confirmed', data => updateUI([data]));
```

### Step 6 — Test in staging

Deploy your updated integration to staging with `HW_BASE_URL` pointing at the v2 endpoint. Verify:
- All CRUD operations return expected shapes
- Error codes match your switch/case handlers
- Pagination works correctly with `totalPages`
- Webhook deliveries still arrive and signatures verify correctly

### Step 7 — Deploy to production

Update production environment variables and deploy. Monitor `API-Version` response headers to confirm all calls are on v2.

---

## Database Migrations

Health Watchers uses `migrate-mongo` for schema migrations. Migrations run automatically at container startup in production.

### Running manually

```bash
# Check current migration status
npm run migrate:status

# Apply all pending migrations
npm run migrate:up

# Roll back the last migration
npm run migrate:down

# Create a new migration file
npm run migrate:create -- add-patient-risk-field
```

### Migration files location

```
apps/api/migrations/
  20240101000000-initial-schema.js
  20240615000000-add-mfa-fields.js
  20240901000000-add-risk-score.js
  ...
```

---

## Breaking Change Policy

A change is considered breaking if it:
- Removes or renames a response field
- Changes a field's type or format
- Modifies HTTP status codes for existing scenarios
- Changes authentication or authorization requirements
- Removes an endpoint

Non-breaking changes (no version bump required):
- Adding optional fields to responses
- Adding new endpoints
- Adding optional query parameters
- Improving error messages
- Performance improvements

---

## Version Lifecycle

| Phase | Duration | What happens |
|-------|----------|-------------|
| **Current** | Indefinite | Active development, new features |
| **Deprecated** | Minimum 6 months | Security fixes only; deprecation headers added |
| **Sunset** | — | Returns `410 Gone`; migrate required |

Check `/api/versions` for current status:

```bash
curl https://api.healthwatchers.io/api/versions | jq .
```

```json
{
  "versions": [
    {
      "version": "v1",
      "status": "deprecated",
      "baseUrl": "/api/v1",
      "deprecationDate": "2024-12-01",
      "sunsetDate": "2025-06-01"
    },
    {
      "version": "v2",
      "status": "current",
      "baseUrl": "/api/v2",
      "releaseDate": "2024-12-01"
    }
  ],
  "current": "v2",
  "deprecated": ["v1"]
}
```

---

## Common Migration Issues

### Issue: `Warning` header appearing in responses

Your client is still calling `/api/v1`. Update `HW_BASE_URL` to `/api/v2`.

### Issue: `meta` is undefined / `pagination` is undefined

Your pagination code is running against v1 or an endpoint that has not yet been migrated. Switch to v2 and read the `pagination` object from the standardized envelope (see [Pagination Standardization](#pagination-standardization)).

### Issue: Socket.IO events not firing

Socket.IO is v2 only. Ensure the `io()` client connects to the v2-compatible server. The connection path is the same host — no path change needed.

### Issue: `code` field missing from error responses

This means a v1 endpoint is returning the old error shape. Migrate to v2 and update error handling to use `err.code`.

### Issue: `410 Gone` on v1 after sunset

v1 has been sunset. You must migrate to v2 immediately. Note that list response shapes are **not** identical between v1 and v2 — see [Pagination Standardization](#pagination-standardization) for the required client changes.

---

## Pagination Standardization

All v2 list endpoints now share a single pagination contract. This section documents the change for consumers migrating from the previous inconsistent shapes.

### Affected endpoints

The standardized envelope applies to every list endpoint:

- `GET /patients`
- `GET /encounters`
- `GET /appointments`
- `GET /payments`
- `GET /invoices`
- `GET /lab-results`
- `GET /medications`
- `GET /referrals`
- `GET /notifications`

### Old vs. new response shape

**Before (inconsistent):** some endpoints returned a bare array, others returned a `meta` object with different field names.

```json
// Bare array (no metadata)
[
  { "id": "p_1", "name": "Jane Doe" },
  { "id": "p_2", "name": "John Smith" }
]
```

```json
// Legacy `meta` shape (field names varied by module)
{
  "data": [ { "id": "p_1", "name": "Jane Doe" } ],
  "meta": {
    "total": 142,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

**After (standardized):** every list endpoint returns `{ data, pagination }`.

```json
{
  "data": [
    { "id": "p_1", "name": "Jane Doe" },
    { "id": "p_2", "name": "John Smith" }
  ],
  "pagination": {
    "total": 142,
    "page": 1,
    "limit": 20,
    "hasMore": true,
    "nextCursor": "eyJpZCI6IjY1ZjEuLi4ifQ=="
  }
}
```

### Pagination object fields

| Field | Type | Description |
|-------|------|-------------|
| `total` | `number` | Total number of matching records across all pages. |
| `page` | `number` | Current page number (1-based). For cursor-based requests this reflects the resolved page. |
| `limit` | `number` | Maximum number of records per page. |
| `hasMore` | `boolean` | `true` when additional records exist beyond the current page. |
| `nextCursor` | `string \| undefined` | Opaque cursor for the next page. Present only when `hasMore` is `true` and cursor pagination is supported by the endpoint. Treat it as an opaque token — do not parse or construct it. |

> **Removed:** `meta` and `meta.totalPages`. Compute `totalPages` client-side if needed: `Math.ceil(total / limit)`.

### Query parameters

All list endpoints accept the following query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | `integer` ≥ 1 | `1` | Page number for offset-based pagination. |
| `limit` | `integer` 1–100 | `20` | Records per page. Values above 100 are rejected. |
| `sort` | `string` | endpoint-specific | Sort field, optionally prefixed with `-` for descending (e.g. `-createdAt`). |
| `cursor` | `string` | — | Opaque cursor returned as `nextCursor` from a previous response. When supplied, `page` is ignored. |

### Validation errors

Invalid pagination inputs return `400 ValidationError` with the standard v2 error envelope:

```json
{
  "error": "ValidationError",
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "details": [
    { "path": "limit", "message": "limit must be an integer between 1 and 100" }
  ],
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Common triggers:
- `limit` non-numeric, `0`, negative, or greater than `100`
- `page` non-numeric or less than `1`
- `sort` referencing an unknown field
- `cursor` malformed or expired

### Cursor-based pagination for high-volume endpoints

High-volume endpoints (`/encounters`, `/lab-results`, `/notifications`) support cursor-based pagination for stable, efficient traversal. Use `nextCursor` from the previous response as the `cursor` query parameter:

```http
GET /api/v2/encounters?limit=50
```

```json
{
  "data": [ /* 50 encounters */ ],
  "pagination": {
    "total": 12000,
    "page": 1,
    "limit": 50,
    "hasMore": true,
    "nextCursor": "eyJpZCI6IjY1ZjEuLi4ifQ=="
  }
}
```

```http
GET /api/v2/encounters?limit=50&cursor=eyJpZCI6IjY1ZjEuLi4ifQ==
```

```typescript
// Cursor-based traversal
let cursor: string | undefined;
do {
  const res = await hw.encounters.list({ limit: 50, cursor });
  process(res.data);
  cursor = res.pagination.hasMore ? res.pagination.nextCursor : undefined;
} while (cursor);
```

Cursor pagination is preferred for large result sets because it avoids the drift and performance cost of deep `OFFSET` queries. Offset-based pagination (`page`/`limit`) remains available on all endpoints for UI use cases that need random page access.

### Consumer migration checklist

- [ ] Update API client base URL to `/api/v2`.
- [ ] Replace reads of `meta` with `pagination`.
- [ ] Replace `meta.totalPages` with `Math.ceil(pagination.total / pagination.limit)` (or use `hasMore`).
- [ ] Handle endpoints that previously returned a bare array — read results from `data`.
- [ ] Replace `hasNext`/`hasPrev` checks with `pagination.hasMore` (there is no `hasPrev`; derive it as `page > 1`).
- [ ] Use `pagination.nextCursor` (opaque) for cursor-based traversal on high-volume endpoints.
- [ ] Validate `limit` stays within `1–100` and handle `400 VALIDATION_ERROR` responses.
- [ ] Update integration tests to assert the `{ data, pagination }` envelope, including empty, single-page, and last-page cases.
- [ ] Update Postman collections and generated OpenAPI clients to the new schema.
