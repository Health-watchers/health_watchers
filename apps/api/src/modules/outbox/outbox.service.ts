import crypto from 'crypto';
import mongoose, { ClientSession } from 'mongoose';
import logger from '@api/utils/logger';
import { OutboxEventModel, OutboxTarget } from './outbox-event.model';

export interface OutboxEventInput {
  type: string;
  aggregateType: string;
  aggregateId: string;
  clinicId: string;
  payload: Record<string, unknown>;
  targets: OutboxTarget[];
}

/**
 * Stage an event in the caller's transaction. It becomes visible to the relay
 * only if the surrounding transaction commits.
 */
export async function recordOutboxEvent(
  input: OutboxEventInput,
  session: ClientSession
): Promise<string> {
  const eventId = crypto.randomUUID();
  await OutboxEventModel.create(
    [
      {
        ...input,
        eventId,
        payload: { ...input.payload, eventId },
        status: 'pending',
        nextAttemptAt: new Date(),
      },
    ],
    { session }
  );
  return eventId;
}

export type EmitOutboxEvent = (input: OutboxEventInput) => Promise<string>;

/**
 * Run `work` in a MongoDB transaction together with any outbox events it
 * emits. After commit the events are handed to the relay immediately (fast
 * path); if this process dies first, the scheduled `outbox-relay` job
 * delivers them on the next sweep.
 */
export async function withOutboxTransaction<T>(
  work: (session: ClientSession, emit: EmitOutboxEvent) => Promise<T>
): Promise<T> {
  const eventIds: string[] = [];
  const session = await mongoose.startSession();
  let result!: T;
  try {
    await session.withTransaction(async () => {
      // withTransaction may retry the callback on transient errors.
      eventIds.length = 0;
      result = await work(session, async (input) => {
        const id = await recordOutboxEvent(input, session);
        eventIds.push(id);
        return id;
      });
    });
  } finally {
    await session.endSession();
  }
  dispatchCommittedOutboxEvents(eventIds);
  return result;
}

/** Fast path: deliver freshly committed events without waiting for the sweep. */
export function dispatchCommittedOutboxEvents(eventIds: string[]): void {
  if (eventIds.length === 0) return;
  setImmediate(() => {
    // Lazy import breaks the service → relay → webhook → service import cycle.
    import('./outbox.relay')
      .then(({ deliverOutboxEvent }) =>
        Promise.all(eventIds.map((id) => deliverOutboxEvent(id)))
      )
      .catch((err) =>
        logger.warn({ err, eventIds }, '[outbox] fast-path delivery failed — sweep will retry')
      );
  });
}
