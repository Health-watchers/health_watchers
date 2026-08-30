# ADR-002: Scaling Strategy

## Status

Accepted

## Date

2024-02-10

## Context

Health Watchers must handle:

- Multiple independent clinic tenants, each with varying patient loads
- Bursty traffic during clinic opening hours (morning/afternoon peaks)
- HIPAA audit-log writes on every PHI access — potentially the highest-volume write path
- A separate Stellar payment service with its own throughput profile
- Background jobs (risk recalculation, appointment reminders, reconciliation) that compete for DB connections

The system needs to scale without requiring large, expensive single-server deployments, and must degrade gracefully rather than hard-fail under load.

## Decision

Adopt a **horizontal scaling** model based on three pillars:

### 1. Stateless API pods behind a load balancer

All per-request state (identity, session) is carried in JWTs and verified on every request. No sticky sessions. The Express process is fully stateless, so any pod can serve any request.

### 2. MongoDB horizontal sharding for write-heavy collections

Five collections are pre-configured for sharding (see `apps/api/src/config/sharding-strategy.ts`):

| Collection | Shard key | Strategy | Shards |
|------------|-----------|----------|--------|
| `patients` | `clinicId` | Hashed | 4 |
| `encounters` | `clinicId` | Hashed | 4 |
| `auditlogs` | `clinicId` | Hashed | 8 |
| `healthlogs` | `patientId` | Hashed | 6 |
| `communicationlogs` | `createdAt` | Range (monthly) | 12 |

`clinicId`-hashed sharding keeps all data for a single clinic on the same shard, preserving data locality for most queries. `createdAt`-range sharding on CommunicationLog optimises time-series scans.

MongoDB is deployed as a **replica set** (1 primary + 2 secondaries) for high availability. Read-preference `secondaryPreferred` is used for reporting and dashboard aggregations.

### 3. Redis as the shared rate-limit and cache store

A single Redis instance (or Redis Cluster for very high scale) is shared across all API pods. This ensures:

- Rate-limit counters are global, not per-pod (prevents bypass via distributing requests)
- Cache invalidation (`cache.delPattern`) is immediately visible to all pods
- Token denylist checks are consistent across the fleet

Connection pool settings (`MONGODB_POOL_SIZE`, `MONGODB_MIN_POOL_SIZE`) are tunable via environment variables without code changes.

### 4. Background job isolation

All background jobs (payment expiration, reconciliation, risk recalculation, appointment reminders, etc.) run in the same API process but are registered as independent `setInterval` timers. They use `.unref()` where appropriate to avoid blocking graceful shutdown. The jobs are designed to be idempotent so duplicate execution (e.g. during a rolling restart) is safe.

### 5. Kubernetes Horizontal Pod Autoscaler (HPA)

Kubernetes manifests include an HPA for the API deployment keyed on CPU utilisation (target 70%). PodDisruptionBudgets (PDBs) ensure at least one pod is always available during rolling updates.

## Consequences

### Positive

- Stateless pods can be scaled from 1 to N with no code changes.
- Sharding defers the need for vertical DB scaling well into multi-million-record territory.
- Redis-backed rate limiting prevents a single pod's in-memory counter from being trivially bypassed in multi-replica deployments.
- The HPA reacts to real load rather than requiring manual scaling events.

### Negative / Trade-offs

- Hashed shard keys prevent range queries on `clinicId`; compound indexes on `{ clinicId, field }` are required for efficient scans within a clinic.
- A Redis outage means rate limiting falls back to per-pod in-memory counters (documented warning in `env.ts`).
- Background jobs running inside the API process consume connection pool slots; under extreme load they may need to be extracted to a separate worker service.
- MongoDB sharding adds operational overhead: `mongos` routers, config servers, and shard rebalancing must be maintained.

### Neutral

- The pool monitor (`db.ts`) logs warnings at 80 % and errors at 95 % pool utilisation every 30 seconds, feeding into Prometheus/Grafana dashboards.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Vertical scaling (bigger server) | Hits a cost ceiling quickly; does not improve fault tolerance |
| Citus (PostgreSQL sharding) | Requires PostgreSQL migration; MongoDB sharding is native to the chosen DB |
| Separate worker service for background jobs | Correct long-term direction, but adds deployment complexity before scale warrants it |
| Redis Cluster from day one | Single Redis instance is simpler and sufficient until > 10k req/s; cluster migration path is documented |

## References

- `apps/api/src/config/sharding-strategy.ts` — shard key definitions
- `apps/api/src/config/db.ts` — connection pool configuration and monitoring
- `apps/api/src/config/env.ts` — `REDIS_URL` production warning
- `k8s/` — Kubernetes manifests including HPA and PDB definitions
- `docs/KUBERNETES_DEPLOYMENT.md`
