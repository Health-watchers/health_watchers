# Service Layer Guide

> Issue #1061 — Refactor Service Layer

This document describes the organisation, responsibilities, and usage
conventions for every shared service in `apps/api/src/services/`.

---

## Architecture Overview

```
apps/api/src/services/
├── cache.service.ts              — Redis-backed cache (get / set / del / ping)
├── token-denylist.service.ts     — JWT revocation via Redis denylist
├── metrics.service.ts            — Prometheus counters, histograms, gauges
├── business-metrics.service.ts   — Domain KPIs (payments, encounters, users)
├── backup-metrics.service.ts     — Backup-verification Prometheus metrics
├── socket.service.ts             — Socket.IO real-time event broadcasting
├── streaming-export.ts           — Chunked CSV / NDJSON streaming exports
├── batch-queue.ts                — Async batch-processing queue
├── sharding.service.ts           — MongoDB shard-key routing helpers
├── progress-tracker.ts           — Long-running-job progress tracking
├── metrics-integration-examples.ts — Usage examples (dev reference only)
└── index.ts                      — Barrel — single import point for consumers
```

### Design Principles

1. **Single responsibility** — each service owns exactly one cross-cutting concern.
2. **Fail-open** — caching, metrics, and rate-limit services must degrade
   gracefully when Redis is unavailable; they must never throw to callers.
3. **No circular dependencies** — services may not import from `modules/`;
   modules import from `services/`.
4. **Barrel-only imports** — application code should import from
   `@api/services` (the barrel), not from individual service files.

---

## Services

### `cache` — Redis Cache

**File:** `cache.service.ts`

Provides a thin, fail-safe wrapper around `ioredis`.  All methods return
gracefully when Redis is unavailable (no REDIS_URL → every read is a miss,
every write is a no-op).

| Method | Signature | Description |
|---|---|---|
| `get<T>` | `(key: string) → T \| null` | Deserialise a cached value |
| `set` | `(key, value, ttlSeconds) → void` | Serialise and cache with TTL |
| `del` | `(key: string) → void` | Delete a single key |
| `delPattern` | `(pattern: string) → void` | Delete all keys matching a glob |
| `ping` | `() → { status, latency? }` | Health-check the Redis connection |

**Exported helpers:**
- `getCacheMetrics()` — returns `{ hits, misses, hitRate }`.

**Usage example:**

```ts
import { cache } from '@api/services';

const cached = await cache.get<Patient[]>(`patients:${clinicId}`);
if (!cached) {
  const patients = await PatientModel.find({ clinicId }).lean();
  await cache.set(`patients:${clinicId}`, patients, 300); // 5 min TTL
}
```

---

### `token-denylist` — JWT Revocation

**File:** `token-denylist.service.ts`

Stores revoked JWT IDs (`jti`) in Redis with a TTL matching the token's
remaining lifetime so the denylist never grows unbounded.

| Export | Description |
|---|---|
| `addToDenylist(jti, ttlSeconds)` | Revoke a token by its JTI |
| `isDenylisted(jti)` | Check whether a JTI has been revoked |
| `setUserInvalidatedAt(userId, ts)` | Revoke all tokens for a user (logout-all) |
| `isInvalidatedForUser(userId, iat)` | Check per-user invalidation (issued-before guard) |

**Key prefixes:**

| Prefix | Purpose |
|---|---|
| `token-denylist:{jti}` | Per-token revocation |
| `user-invalidated:{userId}` | Per-user logout-all timestamp |

---

### `metrics` — Prometheus Metrics

**File:** `metrics.service.ts`

Registers all Prometheus metrics for the API.  Consumers must **not**
create their own `Counter`, `Histogram`, or `Gauge` instances — import
the pre-registered ones from `@api/services`.

Key metric groups:

| Group | Examples |
|---|---|
| HTTP | `httpRequestsTotal`, `httpRequestDurationSeconds` |
| Patients / Encounters | `patientsCreatedTotal`, `encountersCreatedTotal` |
| Payments | `paymentsInitiatedTotal`, `paymentsConfirmedTotal`, `paymentSuccessRate` |
| Stellar | `stellarTransactionFeeXlm`, `xlmRateLastValueUsd` |
| AI | `aiRequestsTotal` |
| MongoDB | `mongodbConnectionPoolSize`, `mongodbKeyDecryptionFailures` |
| Rate limiting | `rateLimitHitsTotal` |

---

### `business-metrics` — Domain KPIs

**File:** `business-metrics.service.ts`

High-level helpers that combine multiple Prometheus metric updates into
a single semantic action.

| Export | Description |
|---|---|
| `recordPaymentSuccessRate(success)` | Increment succeeded / failed counters |
| `updatePaymentSuccessRateFromCounts(ok, fail)` | Bulk update from counts |
| `recordEncounterDuration(durationMs)` | Record encounter session duration |
| `updateActiveUsers(count)` | Set the active-users gauge |
| `recordApiKeyRequest(keyId, path)` | Track per-key API usage |
| `recordStellarTransactionFee(xlm)` | Record XLM fee for a Stellar tx |

---

### `backup-metrics` — Backup Verification

**File:** `backup-metrics.service.ts`

Lazily registers Prometheus metrics that track the backup-verification
pipeline.  Call `initializeBackupMetrics()` once at startup before the
metrics endpoint is scraped.

---

### `SocketService` — Real-time Broadcasting

**File:** `socket.service.ts`

Thin adapter over Socket.IO that provides clinic-room and user-room
broadcasting without exposing the raw `Server` instance.

| Method | Description |
|---|---|
| `SocketService.init(io)` | Attach to an existing Socket.IO server |
| `SocketService.emitToClinic(clinicId, event, data)` | Broadcast to all clinic members |
| `SocketService.emitToUser(userId, event, data)` | Broadcast to a single user |

---

### `streaming-export` — Chunked Streaming

**File:** `streaming-export.ts`

Streams large datasets as CSV or NDJSON directly into an HTTP response
without buffering the full result set in memory.

```ts
import { streamCsvExport } from '@api/services/streaming-export';

await streamCsvExport(res, PaymentModel, filter, columns);
```

---

### `batch-queue` — Async Batch Processing

**File:** `batch-queue.ts`

A simple in-process queue for coalescing high-frequency writes (e.g.,
audit events) into batched DB inserts, reducing write pressure.

---

### `progress-tracker` — Long-Running Job Progress

**File:** `progress-tracker.ts`

Tracks the progress of async jobs (exports, bulk imports) and exposes
a polling endpoint so clients can display progress bars.

---

## Adding a New Service

1. Create `apps/api/src/services/my-feature.service.ts`.
2. Keep the file focused on a single responsibility.
3. Export from `index.ts` with a section comment.
4. Document the service in this guide under a new `###` heading.
5. Ensure the service fails gracefully — never let an infrastructure
   error propagate to the HTTP response layer.

---

## Import Convention

```ts
// ✅ Correct — import from the barrel
import { cache, SocketService, httpRequestsTotal } from '@api/services';

// ❌ Avoid — bypasses the barrel
import { cache } from '@api/services/cache.service';
```

Using the barrel ensures consistent aliasing and makes future renames
transparent to consumers.
