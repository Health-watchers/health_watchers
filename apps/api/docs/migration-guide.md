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

v2 list endpoints include `totalPages` in the `meta` object:

```json
{
  "meta": {
    "total": 142,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

v1 returns only `total`, `page`, and `limit`. Update any pagination logic to use `totalPages` in v2.

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

```typescript
// Before (v1 — manual calculation)
const totalPages = Math.ceil(meta.total / meta.limit);

// After (v2 — provided directly)
const { totalPages } = meta;
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

### Issue: `totalPages` undefined

Your pagination code is running against v1. Switch to v2, which includes `totalPages` in every list response.

### Issue: Socket.IO events not firing

Socket.IO is v2 only. Ensure the `io()` client connects to the v2-compatible server. The connection path is the same host — no path change needed.

### Issue: `code` field missing from error responses

This means a v1 endpoint is returning the old error shape. Migrate to v2 and update error handling to use `err.code`.

### Issue: `410 Gone` on v1 after sunset

v1 has been sunset. You must migrate to v2 immediately. All request/response shapes are compatible — only the base URL prefix changes.
