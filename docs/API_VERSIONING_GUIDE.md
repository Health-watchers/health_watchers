# API Versioning Guide

This guide explains how Health Watchers APIs handle versioning, how to negotiate versions, and how to handle deprecation notices and migrate between API versions.

**Last updated**: 2026-10-17  
**Current API Version**: v1 (stable), v2 (beta)

---

## Table of Contents

- [Versioning Scheme](#versioning-scheme)
- [Version Negotiation](#version-negotiation)
- [Deprecation & Sunset Dates](#deprecation--sunset-dates)
- [Migration Guides](#migration-guides)
- [Common Breaking Changes](#common-breaking-changes)
- [Examples](#examples)

---

## Versioning Scheme

Health Watchers uses **semantic versioning** with two methods for specifying API versions:

### 1. URL Path Versioning

The traditional approach: version is part of the URL path.

```
GET /api/v1/patients
GET /api/v2/patients
```

**When used**: Recommended for most endpoints; clearer URL structure.

### 2. Header-Based Versioning

Alternative approach: version specified via HTTP header.

```
GET /api/patients
Accept: application/vnd.health-watchers.v1+json
```

**When used**: For backward compatibility; allows same URL to serve multiple versions.

### Version Semantics

- **v1**: Stable, production-ready. Changes are backward-compatible unless marked deprecated.
- **v2**: Beta or newer major version. Breaking changes relative to v1.
- **Future**: v3, v4, etc. Each major version introduces significant changes.

---

## Version Negotiation

### Default Behavior

When no version is specified:
- **URL path requests** → Use the latest major version (currently v1)
- **Header requests** → Use `application/vnd.health-watchers.v1+json` (v1)

### Explicit Version Selection

**Via URL path** (recommended):
```bash
curl -H "Authorization: Bearer <token>" \
  https://api.example.com/api/v2/patients
```

**Via Accept header**:
```bash
curl -H "Authorization: Bearer <token>" \
  -H "Accept: application/vnd.health-watchers.v2+json" \
  https://api.example.com/api/patients
```

### Server Response

All responses include a version header:
```
X-API-Version: v2
X-API-Deprecation-Date: 2027-06-30
X-API-Sunset-Date: 2027-12-31
```

---

## Deprecation & Sunset Dates

### Deprecation Timeline

1. **Announcement** (Month 1): Breaking change announced via:
   - Changelog (`CHANGELOG.md`)
   - API status page
   - Email to registered developers
   
2. **Deprecation Period** (Months 2–12): Old version continues to work with warnings:
   - Response header: `X-API-Deprecation-Date`
   - Response header: `X-API-Sunset-Date`
   - Deprecation notice in API documentation

3. **Sunset** (Month 13): Old version returns 410 Gone
   ```json
   {
     "error": "EndpointDeprecated",
     "message": "/api/v1/patients endpoint sunset on 2027-12-31",
     "new_endpoint": "/api/v2/patients"
   }
   ```

### Current Deprecation Schedule

#### v1 Endpoints (Stable)

No endpoints currently deprecated. v1 is in active maintenance.

---

## Migration Guides

### v1 → v2 Migration

This guide covers migrating from v1 endpoints to v2 (if/when v2 becomes available).

#### Patient Endpoints

**Before (v1)**:
```bash
GET /api/v1/patients?page=1&limit=20
```

**After (v2)**:
```bash
GET /api/v2/patients?cursor=abc123&limit=20
```

**Changes**:
- Pagination: Offset-based (`page`, `limit`) → Cursor-based (`cursor`, `limit`)
- Reason: Cursor pagination is more efficient for large datasets and handles concurrent insertions

**Migration Example**:
```javascript
// v1: Offset pagination
async function getPatients(page = 1) {
  const response = await fetch(
    `/api/v1/patients?page=${page}&limit=20`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  return await response.json();
}

// v2: Cursor pagination
async function getPatientsV2(cursor = null) {
  const query = cursor ? `?cursor=${cursor}&limit=20` : '?limit=20';
  const response = await fetch(
    `/api/v2/patients${query}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const data = await response.json();
  return {
    patients: data.data,
    nextCursor: data.pagination.cursor
  };
}
```

#### Response Format Changes

**Before (v1)**:
```json
{
  "status": "success",
  "data": [{ "id": "123", "firstName": "John" }],
  "meta": { "total": 100, "page": 1, "limit": 20 }
}
```

**After (v2)**:
```json
{
  "data": [{ "id": "123", "firstName": "John" }],
  "pagination": {
    "cursor": "eyJpZCI6ICIxMjMifQ==",
    "limit": 20,
    "hasMore": true
  }
}
```

**Changes**:
- Removed `status` field (inferred from HTTP status code)
- Pagination moved to top level
- Cursor replaces offset pagination

#### Error Response Format

**Before (v1)**:
```json
{
  "error": "BadRequest",
  "message": "Invalid patient ID"
}
```

**After (v2)**:
```json
{
  "error": {
    "code": "INVALID_PATIENT_ID",
    "message": "Invalid patient ID",
    "field": "patientId",
    "details": {
      "expected": "ObjectId (24-char hex)",
      "received": "invalid123"
    }
  }
}
```

**Changes**:
- Error is now an object (vs. string)
- Includes error code in SCREAMING_SNAKE_CASE
- Includes field and detailed context

---

## Common Breaking Changes

### 1. Response Field Removal

When a field is removed from the response:

**Deprecation notice**:
```
X-API-Deprecation-Warning: Field 'legacyPhone' will be removed 2026-06-30
```

**Workaround**:
```javascript
// Before (v1)
const phone = patient.legacyPhone;

// After (v2) — field removed, use contact info instead
const phone = patient.contactInfo.phone;
```

### 2. Endpoint Removal

When an entire endpoint is removed:

**Before**:
```bash
GET /api/v1/analytics/deprecated-metric
```

**After**:
```bash
GET /api/v2/analytics/metrics  # Use new endpoint instead
```

**Migration**:
```javascript
// Before (v1) — deprecated endpoint
async function getDeprecatedMetric() {
  const response = await fetch('/api/v1/analytics/deprecated-metric');
  return response.json();
}

// After (v2) — new endpoint
async function getMetric() {
  const response = await fetch('/api/v2/analytics/metrics?type=new');
  return response.json();
}
```

### 3. Parameter Changes

When request parameters change:

**Before (v1)**:
```bash
POST /api/v1/payments/intent \
  -d '{"amount": "10", "asset": "XLM"}'
```

**After (v2)**:
```bash
POST /api/v2/payments/intent \
  -d '{"amount": {"value": "10", "asset": "XLM"}}'
```

**Migration**:
```javascript
// v1 Request
const paymentV1 = {
  amount: "10",
  asset: "XLM",
  destination: "GBXXXXXXXXXX"
};

// v2 Request
const paymentV2 = {
  amount: {
    value: "10",
    asset: "XLM"
  },
  destination: "GBXXXXXXXXXX"
};
```

---

## Examples

### Example 1: Basic Version Negotiation

```bash
#!/bin/bash

TOKEN="your_access_token"
API_URL="https://api.example.com"

# Request v2 API
curl -X GET "${API_URL}/api/v2/patients" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/json"

# Response
# HTTP/1.1 200 OK
# X-API-Version: v2
# X-API-Deprecation-Date: (none for v2)
# Content-Type: application/json
#
# {
#   "data": [...],
#   "pagination": {...}
# }
```

### Example 2: Handling Deprecation Notices

```javascript
async function makeRequest(endpoint, options = {}) {
  const response = await fetch(`/api/v2${endpoint}`, options);
  
  // Check for deprecation notices
  const deprecationDate = response.headers.get('X-API-Deprecation-Date');
  if (deprecationDate) {
    const sunset = new Date(deprecationDate);
    const daysUntilSunset = Math.ceil((sunset - new Date()) / (1000 * 60 * 60 * 24));
    console.warn(`⚠️  API endpoint will be removed in ${daysUntilSunset} days (${deprecationDate})`);
  }
  
  const sunsetDate = response.headers.get('X-API-Sunset-Date');
  if (sunsetDate) {
    console.warn(`☠️  Endpoint sunset date: ${sunsetDate}`);
  }
  
  if (response.status === 410) {
    throw new Error('Endpoint has been removed. See X-API-Sunset-Date header.');
  }
  
  return response.json();
}

// Usage
try {
  const patients = await makeRequest('/patients?limit=20');
} catch (error) {
  console.error('API error:', error.message);
}
```

### Example 3: Cursor-Based Pagination

```javascript
async function getAllPatients() {
  const patients = [];
  let cursor = null;
  
  while (true) {
    const url = cursor 
      ? `/api/v2/patients?cursor=${cursor}&limit=50`
      : '/api/v2/patients?limit=50';
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    patients.push(...data.data);
    
    // Check if there are more pages
    if (!data.pagination.hasMore) break;
    
    cursor = data.pagination.cursor;
  }
  
  return patients;
}
```

### Example 4: Postman Collection Versioning

In Postman, organize requests by version:

```
Health Watchers API
├── v1 (Stable)
│   ├── Patients
│   │   ├── List Patients
│   │   ├── Get Patient
│   │   └── Create Patient
│   └── Payments
│       ├── Create Payment Intent
│       └── Confirm Payment
└── v2 (Beta)
    ├── Patients
    │   ├── List Patients (Cursor)
    │   ├── Get Patient
    │   └── Create Patient (v2 format)
    └── Payments
        ├── Create Payment Intent (v2)
        └── Confirm Payment (v2)
```

Pre-request script to handle version negotiation:
```javascript
// Set base URL and version
pm.globals.set("api_version", "v2");
pm.globals.set("api_url", "https://api.example.com/api");

// Construct full URL
pm.request.url.path = `/${pm.globals.get("api_version")}/patients`;
```

---

## Support & Resources

- **Changelog**: See `CHANGELOG.md` for version history and breaking changes
- **API Documentation**: Full endpoint reference at `docs/API_DOCUMENTATION.md`
- **Security Policy**: `docs/SECURITY_POLICY.md` for version security updates
- **Status Page**: https://status.example.com for API incident notifications
- **Deprecation Timeline**: Check response headers for `X-API-Deprecation-Date` and `X-API-Sunset-Date`

---

## FAQ

**Q: How long is v1 supported?**  
A: v1 is in active maintenance with no sunset date announced. Deprecation notices will be given 12 months in advance.

**Q: Can I use both v1 and v2 in the same application?**  
A: Yes. You can gradually migrate endpoints by routing different requests to different versions during transition.

**Q: What happens if I don't migrate before sunset?**  
A: Requests to a sunset endpoint return HTTP 410 Gone with an error message and new endpoint reference.

**Q: How do I report a version compatibility issue?**  
A: Open an issue at https://github.com/Health-Watchers/health_watchers/issues or contact support@example.com.
