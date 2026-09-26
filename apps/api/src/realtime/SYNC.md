# Real-time data synchronization (#1254)

Files: `sync.types.ts`, `sync.service.ts`, `sync.handler.ts`, `sync.metrics.ts`.
Wired into the shared Socket.IO server in `socket.ts` (per-connection, clinic-scoped).

## Engine (`sync.service.ts`)

- **Sequencing** — every accepted change gets a strictly increasing per-clinic
  `seq` (the cursor a client persists) and a per-record `version`.
- **Conflict resolution** — optimistic concurrency on `baseVersion`. A stale
  write is resolved deterministically with last-writer-wins: higher `originTs`,
  then higher `changeId` as a stable tiebreak. Same inputs → same winner on
  every node, so replicas converge.
- **Idempotency** — repeat `changeId`s are no-ops.
- **Reconciliation** — `reconcile({ sinceSeq })` returns the ordered delta a
  reconnecting client missed, or `resyncRequired` when its cursor aged out of
  the in-memory ring buffer.

Process-local today; the API is deliberately small so it can be backed by Redis
streams (one per clinic) for multi-instance deploys.

## Socket protocol

| Direction | Event | Payload |
|-----------|-------|---------|
| c → s | `sync:subscribe` | `{ resources: string[] }` |
| c → s | `sync:push` | `{ changes: SyncChange[] }` → ack `{ acks }` |
| c → s | `sync:reconcile` | `{ sinceSeq, resources? }` |
| s → c | `sync:batch` | `{ changes: SequencedChange[] }` (coalesced, deduped per record) |
| s → c | `sync:delta` | `{ changes, currentSeq }` |
| s → c | `sync:resync-required` | `{ currentSeq }` |

Outbound changes are batched per clinic (flush every 50 ms or at 100 changes)
and reduced to the latest change per record — bandwidth optimization + message
batching in one step.

## Metrics (Prometheus, on the shared registry)

`sync_changes_total`, `sync_conflicts_total`, `sync_propagation_seconds`
(origin-ts → broadcast; the <500 ms acceptance metric), `sync_batch_size`,
`sync_reconnections_total`, `sync_active_clients`.
