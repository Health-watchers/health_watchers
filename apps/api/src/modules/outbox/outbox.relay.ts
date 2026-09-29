/**
 * Outbox relay (#1432) — publishes committed outbox events to webhooks,
 * in-app notifications and Socket.IO.
 *
 * Two entry points share the same claim/deliver logic:
 *  - deliverOutboxEvent(): called right after commit (fast path)
 *  - relayPendingOutboxEvents(): the `outbox-relay` BullMQ scheduled job; picks
 *    up anything the fast path missed (crash, Redis/DB blip, failed target)
 *
 * Delivery is at-least-once. Each event is claimed with a short lease so two
 * relays never work the same event at once, and every target that succeeds is
 * recorded so a retry only re-sends the targets that failed. Webhook
 * deliveries are additionally de-duplicated per (eventId, webhookId).
 */
import client from 'prom-client';
import logger from '@api/utils/logger';
import { register } from '@api/services/metrics.service';
import { emitToClinic, emitToUser } from '@api/realtime/socket';
import { SocketService } from '@api/services/socket.service';
import { dispatchWebhookEvent } from '@api/modules/webhooks/event-dispatcher';
import { createNotification } from '@api/modules/notifications/notification.service';
import type { NotificationType } from '@api/modules/notifications/notification.model';
import { OutboxEventModel, IOutboxEvent, OutboxTarget } from './outbox-event.model';

export const LEASE_MS = 60_000;
export const MAX_ATTEMPTS = 10;
const SWEEP_BATCH = 100;

// ── Metrics ───────────────────────────────────────────────────────────────────

export const outboxLagSeconds = new client.Gauge({
  name: 'outbox_lag_seconds',
  help: 'Age in seconds of the oldest undelivered (pending) outbox event',
  registers: [register],
});

export const outboxPendingEvents = new client.Gauge({
  name: 'outbox_pending_events',
  help: 'Number of outbox events waiting to be delivered',
  registers: [register],
});

export const outboxDeliveryFailuresTotal = new client.Counter({
  name: 'outbox_delivery_failures_total',
  help: 'Failed outbox target deliveries',
  labelNames: ['target'] as const,
  registers: [register],
});

export const outboxEventsDeliveredTotal = new client.Counter({
  name: 'outbox_events_delivered_total',
  help: 'Outbox events whose targets were all delivered',
  labelNames: ['type'] as const,
  registers: [register],
});

export const outboxEventsDeadTotal = new client.Counter({
  name: 'outbox_events_dead_total',
  help: `Outbox events abandoned after ${MAX_ATTEMPTS} attempts`,
  labelNames: ['type'] as const,
  registers: [register],
});

export const outboxDeliveryLatencySeconds = new client.Histogram({
  name: 'outbox_delivery_latency_seconds',
  help: 'Time from commit to all targets delivered',
  labelNames: ['type'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60, 300],
  registers: [register],
});

// ── Publishing ────────────────────────────────────────────────────────────────

/** Backoff for the next attempt: 5s, 10s, 20s … capped at 10 minutes. */
export function nextAttemptDelayMs(attempts: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 10 * 60_000);
}

function emitSocket(target: Extract<OutboxTarget, { kind: 'socket' }>, data: unknown): void {
  if (target.via === 'socket-service') {
    const service = SocketService.getInstance();
    // No Socket.IO server in this process (e.g. the worker) — nothing to emit to.
    if (!service) return;
    if (target.room === 'appointment') service.emitAppointmentUpdate(target.id, target.event, data);
    else if (target.room === 'clinic') service.emitToClinic(target.id, target.event, data);
    else service.emitToUser(target.id, target.event, data);
    return;
  }
  if (target.room === 'user') emitToUser(target.id, target.event, data);
  else emitToClinic(target.id, target.event, data);
}

/**
 * Publish one target. Returns the keys that were delivered; throws when the
 * target (or part of it) must be retried.
 */
async function publishTarget(
  event: IOutboxEvent,
  target: OutboxTarget,
  index: number,
  delivered: Set<string>
): Promise<string[]> {
  switch (target.kind) {
    case 'webhook': {
      const result = await dispatchWebhookEvent({
        clinicId: event.clinicId,
        event: target.event as any,
        data: event.payload,
        eventId: event.eventId,
      });
      if (result.failed > 0) {
        throw new Error(`${result.failed}/${result.total} webhook deliveries could not be queued`);
      }
      return [String(index)];
    }
    case 'socket': {
      emitSocket(target, target.data ?? event.payload);
      return [String(index)];
    }
    case 'notification': {
      const keys: string[] = [];
      let firstError: unknown;
      for (const userId of target.userIds) {
        const key = `${index}:${userId}`;
        if (delivered.has(key)) continue;
        try {
          await createNotification({
            userId,
            clinicId: event.clinicId,
            type: target.notificationType as NotificationType,
            title: target.title,
            message: target.message,
            metadata: { ...target.metadata, eventId: event.eventId },
          });
          keys.push(key);
        } catch (err) {
          firstError ??= err;
        }
      }
      if (firstError) {
        // Keep the per-user progress, then retry the rest.
        await OutboxEventModel.updateOne(
          { eventId: event.eventId },
          { $addToSet: { deliveredTargets: { $each: keys } } }
        );
        throw firstError;
      }
      return [...keys, String(index)];
    }
    default:
      throw new Error(`unknown outbox target kind: ${(target as { kind: string }).kind}`);
  }
}

/**
 * Claim `eventId` and publish its outstanding targets.
 * Returns the resulting status, or `null` when there was nothing to do
 * (already delivered, or another relay currently holds the lease).
 */
export async function deliverOutboxEvent(eventId: string): Promise<IOutboxEvent['status'] | null> {
  const now = new Date();
  const event = await OutboxEventModel.findOneAndUpdate(
    {
      eventId,
      status: 'pending',
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    { $set: { lockedUntil: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
    { new: true }
  ).lean<IOutboxEvent>();
  if (!event) return null;

  const delivered = new Set(event.deliveredTargets ?? []);
  const newlyDelivered: string[] = [];
  let failure: unknown;

  for (let i = 0; i < event.targets.length; i++) {
    if (delivered.has(String(i))) continue;
    const target = event.targets[i];
    try {
      const keys = await publishTarget(event, target, i, delivered);
      keys.forEach((k) => delivered.add(k));
      newlyDelivered.push(...keys);
    } catch (err) {
      failure ??= err;
      outboxDeliveryFailuresTotal.inc({ target: target.kind });
      logger.warn(
        { err, eventId, type: event.type, target: target.kind, attempt: event.attempts },
        '[outbox] target delivery failed'
      );
    }
  }

  if (!failure) {
    await OutboxEventModel.updateOne(
      { eventId },
      {
        $set: { status: 'delivered', deliveredAt: new Date(), lockedUntil: null },
        $addToSet: { deliveredTargets: { $each: newlyDelivered } },
        $unset: { lastError: 1 },
      }
    );
    outboxEventsDeliveredTotal.inc({ type: event.type });
    if (event.createdAt) {
      outboxDeliveryLatencySeconds.observe(
        { type: event.type },
        (Date.now() - new Date(event.createdAt).getTime()) / 1000
      );
    }
    return 'delivered';
  }

  const dead = event.attempts >= MAX_ATTEMPTS;
  await OutboxEventModel.updateOne(
    { eventId },
    {
      $set: {
        status: dead ? 'failed' : 'pending',
        lockedUntil: null,
        lastError: failure instanceof Error ? failure.message : String(failure),
        nextAttemptAt: new Date(Date.now() + nextAttemptDelayMs(event.attempts)),
      },
      $addToSet: { deliveredTargets: { $each: newlyDelivered } },
    }
  );
  if (dead) {
    outboxEventsDeadTotal.inc({ type: event.type });
    logger.error({ eventId, type: event.type }, '[outbox] event abandoned after max attempts');
    return 'failed';
  }
  return 'pending';
}

/** Refresh the outbox lag / backlog gauges. */
export async function refreshOutboxMetrics(now: Date = new Date()): Promise<void> {
  const [oldest, pending] = await Promise.all([
    OutboxEventModel.findOne({ status: 'pending' })
      .sort({ createdAt: 1 })
      .select('createdAt')
      .lean<{ createdAt?: Date }>(),
    OutboxEventModel.countDocuments({ status: 'pending' }),
  ]);
  outboxPendingEvents.set(pending);
  outboxLagSeconds.set(
    oldest?.createdAt ? Math.max(0, (now.getTime() - new Date(oldest.createdAt).getTime()) / 1000) : 0
  );
}

/**
 * Scheduled sweep (`outbox-relay` job): deliver every due pending event whose
 * lease is free. Returns how many events were delivered in this sweep.
 */
export async function relayPendingOutboxEvents(now: Date = new Date()): Promise<number> {
  const due = await OutboxEventModel.find({
    status: 'pending',
    nextAttemptAt: { $lte: now },
    $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
  })
    .sort({ nextAttemptAt: 1 })
    .limit(SWEEP_BATCH)
    .select('eventId')
    .lean<{ eventId: string }[]>();

  let delivered = 0;
  for (const { eventId } of due) {
    try {
      if ((await deliverOutboxEvent(eventId)) === 'delivered') delivered++;
    } catch (err) {
      logger.error({ err, eventId }, '[outbox] relay failed for event');
    }
  }

  try {
    await refreshOutboxMetrics(now);
  } catch (err) {
    logger.warn({ err }, '[outbox] failed to refresh metrics');
  }
  if (due.length) logger.info({ due: due.length, delivered }, '[outbox] relay sweep complete');
  return delivered;
}
