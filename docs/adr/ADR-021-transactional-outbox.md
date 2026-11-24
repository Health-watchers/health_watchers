# ADR-021: Transactional Outbox for Domain Events

## Status

Accepted

## Date

2026-09-29

## Context

Outbound webhooks, in-app notifications and Socket.IO events were fired inline
after the database write that caused them (issue #1432). A payment confirmation,
for example, committed the payment + invoice transaction and only then emitted
the `payment:confirmed` socket event, created admin notifications and enqueued
`payment.confirmed` webhooks. If the process crashed, was OOM-killed or was
rolled during a deploy between the commit and those calls, the events were lost
for good — integrators never heard about a payment the system considers
confirmed.

Forces:

- We already run MongoDB as a replica set (required for the transactions added
  in #1488), so multi-document transactions are available.
- Background work runs through the distributed BullMQ scheduler (#1433); a job
  scheduled there executes once per tick across all replicas.
- Consumers must be able to de-duplicate; exactly-once delivery over HTTP is
  not achievable, at-least-once with a stable id is.
- Real-time UX should not regress: socket events should still arrive
  immediately, not on the next sweep.

## Decision

Adopt the transactional outbox pattern.

**Write side.** A domain change and the events describing it are written in the
same MongoDB transaction. Events go to the `outbox_events` collection
(`OutboxEventModel`) with a random `eventId`, the event `type`, the aggregate,
a JSON payload, and the list of **targets** to publish to:

| Target kind    | Publishes via                                                          |
| -------------- | ---------------------------------------------------------------------- |
| `webhook`      | `event-dispatcher.ts` → `enqueueWebhookDelivery` (per-webhook retries) |
| `socket`       | `realtime/socket` or `SocketService` (room: clinic, user, appointment) |
| `notification` | `notification.service#createNotification` for each user id            |

Call sites use `withOutboxTransaction(async (session, emit) => …)`, or
`recordOutboxEvent(input, session)` inside an existing transaction (payment
confirmation). If the transaction aborts, the events vanish with it.

**Relay side.** Two paths share one claim-and-deliver routine
(`deliverOutboxEvent`):

1. **Fast path** — right after commit, the committing process delivers its own
   events (`setImmediate`), so sockets and webhooks fire with no added latency.
2. **Sweep** — the `outbox-relay` job (BullMQ job scheduler, every 5 s) delivers
   every `pending` event whose `nextAttemptAt` is due. This is what recovers
   events after a crash: a restarted pod — or any other replica — picks them up.

An event is claimed with an atomic `findOneAndUpdate` that sets a 60 s lease
(`lockedUntil`), so the fast path, the sweep and other replicas never publish
the same event concurrently. Each target that succeeds is recorded in
`deliveredTargets` (`"<index>"`, or `"<index>:<userId>"` for notifications), so
a retry only re-sends what failed. Failed events back off exponentially
(5 s → 10 min) and are marked `failed` after 10 attempts. Delivered events are
kept for 7 days (TTL index) for debugging.

**Idempotency.**

- The `eventId` is included in the webhook envelope (`eventId` field) and sent
  as the `X-Webhook-Event-Id` header; consumers de-duplicate on it.
- `webhook_deliveries` has a unique partial index on `(eventId, webhookId)`, so
  re-dispatching an event never creates a second delivery for the same
  endpoint. A delivery created from the outbox gets a 2-minute
  crash-recovery lease (`nextRetryAt`), so if the process dies before the
  first HTTP attempt, the existing `webhook-retry` job sends it.
- Notification targets carry `metadata.eventId` and per-user progress.

**Metrics** (Prometheus): `outbox_lag_seconds` (age of the oldest pending
event), `outbox_pending_events`, `outbox_delivery_failures_total{target}`,
`outbox_events_delivered_total{type}`, `outbox_events_dead_total{type}` and
`outbox_delivery_latency_seconds{type}`.

**Migrated first:** payment confirmation (`payment.confirmed` webhook, socket,
admin notifications), encounters (create/update → socket + `encounter.created` /
`encounter.updated` webhooks) and appointments (create, update/reschedule,
cancel, check-in → socket + `appointment.created` / `appointment.cancelled`
webhooks).

## Consequences

### Positive

- A crash after commit no longer loses events. The acceptance test
  (`outbox.replset.test.ts`) suppresses the post-commit fast path to simulate
  the kill, then runs the relay sweep and asserts the webhook is delivered
  exactly once.
- `encounter.*` and `appointment.*` webhook event types, which clients could
  subscribe to but which were never emitted, are now delivered.
- Delivery health is observable through lag and failure metrics.

### Negative / Trade-offs

- Delivery is at-least-once: consumers must de-duplicate on `eventId`.
- Writes that emit events now require a transaction, and therefore a replica
  set, including in tests. Suites that mock Mongoose models use
  `modules/outbox/__tests__/inline-outbox.ts`.
- Socket events published by the sweep reach only clients connected to the
  process that runs the sweep, because Socket.IO has no Redis adapter yet. The
  fast path runs in the API process that handled the request, so this only
  affects events recovered after a crash. Adding `@socket.io/redis-adapter`
  removes the limitation.
- One more collection to size and monitor; delivered rows expire after 7 days.

### Neutral

- Emails sent on payment confirmation are still sent inline; they can move to a
  new `email` target kind later.

## Alternatives Considered

| Alternative | Reason rejected |
| ----------- | --------------- |
| Enqueue BullMQ jobs directly after commit | Still loses events if the process dies between commit and enqueue, and Redis is not part of the Mongo transaction |
| MongoDB change streams on domain collections | Couples consumers to collection shapes, needs resume-token storage per consumer, and cannot express per-target retries |
| Two-phase commit across Mongo and Redis | Not supported by the drivers; complexity far beyond the problem |

## References

- Issue #1432 — transactional outbox for reliable domain events
- Issue #1433 — distributed job scheduler (runs the `outbox-relay` sweep)
- `apps/api/src/modules/outbox/` — model, service, relay, tests
- [Transactional outbox pattern](https://microservices.io/patterns/data/transactional-outbox.html)
