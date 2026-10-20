import { Schema, model, models, Model } from 'mongoose';

/**
 * Transactional outbox (#1432, ADR-021).
 *
 * A domain write and the events describing it are committed in the same
 * MongoDB transaction; the relay then publishes each event's targets and
 * records which ones succeeded so a retry never re-sends a finished target.
 */

export type OutboxTarget =
  | {
      kind: 'webhook';
      /** Outbound webhook event name, e.g. `payment.confirmed`. */
      event: string;
    }
  | {
      kind: 'socket';
      room: 'clinic' | 'user' | 'appointment';
      id: string;
      event: string;
      /** Which Socket.IO server to emit through — both exist today. */
      via?: 'realtime' | 'socket-service';
      /** Payload override; defaults to the event payload. */
      data?: Record<string, unknown>;
    }
  | {
      kind: 'notification';
      userIds: string[];
      notificationType: string;
      title: string;
      message: string;
      metadata?: Record<string, unknown>;
    };

export type OutboxStatus = 'pending' | 'delivered' | 'failed';

export interface IOutboxEvent {
  /** Stable id used for idempotent delivery (webhook payload + dedupe keys). */
  eventId: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  clinicId: string;
  payload: Record<string, unknown>;
  targets: OutboxTarget[];
  /** Keys of targets already published: `"<index>"` or `"<index>:<userId>"`. */
  deliveredTargets: string[];
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: Date;
  lockedUntil?: Date | null;
  lastError?: string;
  deliveredAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const outboxEventSchema = new Schema<IOutboxEvent>(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    aggregateType: { type: String, required: true },
    aggregateId: { type: String, required: true },
    clinicId: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    targets: { type: Schema.Types.Mixed, default: [] },
    deliveredTargets: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['pending', 'delivered', 'failed'],
      default: 'pending',
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: (): Date => new Date() },
    lockedUntil: { type: Date, default: null },
    lastError: { type: String },
    deliveredAt: { type: Date },
  },
  { timestamps: true, versionKey: false, collection: 'outbox_events', minimize: false }
);

// Relay sweep: due pending events, oldest first.
outboxEventSchema.index({ status: 1, nextAttemptAt: 1 });
// Lag metric: oldest pending event.
outboxEventSchema.index({ status: 1, createdAt: 1 });
// Delivered events are kept for a week for debugging, then purged.
outboxEventSchema.index(
  { deliveredAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60, partialFilterExpression: { status: 'delivered' } }
);

export const OutboxEventModel = (models.OutboxEvent ||
  model<IOutboxEvent>('OutboxEvent', outboxEventSchema)) as Model<IOutboxEvent>;
