# Query Optimisation Guide

> Issue #1062 — Optimize Database Queries

---

## Profiling Approach

Slow queries are identified using MongoDB's built-in profiler:

```js
// Enable profiling for queries > 100 ms (run in mongosh)
db.setProfilingLevel(1, { slowms: 100 });

// Review the 20 slowest recent queries
db.system.profile
  .find({})
  .sort({ millis: -1 })
  .limit(20)
  .pretty();
```

In production, slow-query logging is always on (see `config/db.ts` —
`serverSelectionTimeoutMS` is coupled with application-level logging).

---

## Index Inventory

### Existing indexes (pre #1062)

Added by previous migrations. See `migrations/` directory for full history.

| Collection | Index name | Fields |
|---|---|---|
| `patients` | `clinicId_1_createdAt_-1` | clinicId, createdAt |
| `patients` | `patients_text_search` | firstName (text), lastName (text), searchName (text), systemId (text) |
| `patients` | `patients_clinicId_isActive_searchName` | clinicId, isActive, searchName |
| `patients` | `patients_clinicId_lastName_firstName` | clinicId, lastName, firstName |
| `patients` | `patients_clinicId_riskLevel_nextRiskReviewDate` | clinicId, riskLevel, nextRiskReviewDate |
| `labresults` | `labresults_text_search` | testName (text), testCode (text) |
| `labresults` | `labresults_clinicId_patientId_orderedAt` | clinicId, patientId, orderedAt |
| `appointments` | `appointments_clinicId_patientId_status` | clinicId, patientId, status |
| `appointments` | `appointments_clinicId_doctorId_status_scheduledAt` | clinicId, doctorId, status, scheduledAt |
| `notifications` | `notifications_userId_isRead_createdAt` | userId, isRead, createdAt |
| `auditlogs` | `auditlogs_clinicId_timestamp` | clinicId, timestamp |

### New indexes added by #1062

Migration: `20260825_query_optimisation_indexes.ts`

| Collection | Index name | Fields | Notes |
|---|---|---|---|
| `encounters` | `encounters_clinicId_patientId_createdAt` | clinicId, patientId, createdAt | Covers the most common list query |
| `encounters` | `encounters_clinicId_status_createdAt` | clinicId, status, createdAt | Open / follow-up filters |
| `encounters` | `encounters_clinicId_followUpDate_status` | clinicId, followUpDate, status | Partial — only docs with followUpDate |
| `paymentrecords` | `payments_clinicId_patientId_createdAt` | clinicId, patientId, createdAt | Payment history per patient |
| `paymentrecords` | `payments_clinicId_status_createdAt` | clinicId, status, createdAt | Status-filtered payment lists |
| `paymentrecords` | `payments_status_expiresAt` | status, expiresAt | Expiration job — partial index |
| `invoices` | `invoices_clinicId_status_createdAt` | clinicId, status, createdAt | Outstanding invoice queries |
| `invoices` | `invoices_clinicId_patientId_createdAt` | clinicId, patientId, createdAt | Per-patient invoice history |
| `webhookdeliveries` | `webhooks_status_nextRetryAt` | status, nextRetryAt | Retry-worker scan — partial index |
| `immunizations` | `immunizations_clinicId_dueDate_status` | clinicId, dueDate, status | Compliance report queries |
| `medicationhistories` | `medications_patientId_clinicId_createdAt` | patientId, clinicId, createdAt | Per-patient medication list |
| `careplans` | `careplans_clinicId_patientId_status` | clinicId, patientId, status | Active care-plan lookup |
| `referrals` | `referrals_clinicId_status_createdAt` | clinicId, status, createdAt | Referral list filters |

---

## Query Patterns & Recommendations

### 1. Always filter on `clinicId` first

The most selective field for multi-tenant queries is `clinicId`.  Every
compound index should start with it so the index prefix rule is satisfied
and MongoDB can use the index even for queries that omit later fields.

```ts
// ✅ Uses the compound index
await EncounterModel.find({ clinicId, patientId }).sort({ createdAt: -1 });

// ⚠️  Does NOT use the clinicId-leading index
await EncounterModel.find({ patientId }).sort({ createdAt: -1 });
```

### 2. Projection — fetch only the fields you need

```ts
// ✅ Covered query — no FETCH stage
await PatientModel
  .find({ clinicId, isActive: true })
  .select('firstName lastName systemId riskLevel')
  .lean();
```

### 3. Use `.lean()` for read-only queries

Mongoose documents carry virtuals, methods, and change-tracking overhead.
For list endpoints that just serialise and return data, `.lean()` reduces
memory allocation by ~40 %.

### 4. Avoid `$where` / JavaScript expressions

These bypass indexes and run in the JavaScript engine.  The `paginate`
utility already strips `$where`, `$expr`, `$function`, and `$accumulator`
from user-supplied filter objects to prevent injection and accidental
full-collection scans.

### 5. Partial indexes for sparse data

When a field exists only on a subset of documents (e.g. `followUpDate`,
`expiresAt`), use a partial index to keep the index small and
maintenance-cheap.

### 6. Prefer `countDocuments` over `count`

`count` is deprecated. `countDocuments` is index-aware when the query
matches an existing index prefix.

### 7. Pagination via cursor, not offset

Offset-based pagination (`skip(n * limit)`) scans `n * limit` documents
before returning results — O(n) cost.  Use the `paginateCursor` helper
from `@api/utils/paginate` for large datasets:

```ts
import { paginateCursor } from '@api/utils/paginate';

const { data, meta } = await paginateCursor(
  EncounterModel,
  { clinicId },
  20,
  req.query.cursor as string | undefined
);
```

---

## Running the Migration

```bash
# Apply all pending migrations
npm run migrate:up --workspace=api

# Check current status
npm run migrate:status --workspace=api

# Roll back the last migration
npm run migrate:down --workspace=api
```

---

## Benchmark Results Template

After applying the #1062 migration, measure with `explain("executionStats")`:

```js
db.encounters.find({ clinicId: ObjectId("..."), patientId: ObjectId("...") })
  .sort({ createdAt: -1 })
  .explain("executionStats");
```

Expected result: `IXSCAN` stage (not `COLLSCAN`), `totalDocsExamined` ≈ `nReturned`.

| Query | Before (ms) | After (ms) | Stage before | Stage after |
|---|---|---|---|---|
| Encounter list by patient | — | — | COLLSCAN | IXSCAN |
| Payment history by patient | — | — | COLLSCAN | IXSCAN |
| Outstanding invoices | — | — | COLLSCAN | IXSCAN |
| Webhook retry scan | — | — | COLLSCAN | IXSCAN |

Fill in the actual timings from `db.system.profile` after deploying to staging.
