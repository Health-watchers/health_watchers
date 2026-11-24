# Database Sharding Strategy

Shard healthcare workloads by tenant or region only after read replicas, indexes, and archival policies are exhausted.

## Candidate Shard Keys

- `tenantId` for B2B clinic isolation.
- `region` for residency and latency boundaries.
- `patientId` only for high-volume patient event streams.

## Rollout

1. Add shard-key fields to every write path.
2. Backfill historical records.
3. Dual-read from old and new routing layers.
4. Move one low-risk tenant first.
