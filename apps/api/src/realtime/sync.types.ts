/**
 * Real-time data synchronization — shared types
 * Issue #1254
 */

/** A single change to a synchronised resource. */
export interface SyncChange {
  /** Globally unique id for this change (client-generated UUID, used for idempotency). */
  changeId: string;
  /** Logical collection / resource type, e.g. "appointment". */
  resource: string;
  /** Id of the specific record that changed. */
  recordId: string;
  /** Operation kind. */
  op: 'create' | 'update' | 'delete';
  /** Full or partial record payload (omitted for deletes). */
  data?: Record<string, unknown>;
  /**
   * Monotonic per-record version the client believes it is updating from.
   * Used for optimistic-concurrency conflict detection.
   */
  baseVersion: number;
  /** Wall-clock time the change was made on the origin client (epoch ms). */
  originTs: number;
  /** User that authored the change. */
  userId: string;
  /** Clinic the record belongs to (sync is always scoped per clinic). */
  clinicId: string;
}

/** A change after the server has accepted and sequenced it. */
export interface SequencedChange extends SyncChange {
  /** Server-assigned, per-clinic strictly increasing sequence number (the sync cursor). */
  seq: number;
  /** New per-record version after applying this change. */
  version: number;
  /** Server receive time (epoch ms). */
  serverTs: number;
}

export type ConflictResolution = 'applied' | 'merged' | 'rejected';

export interface ApplyResult {
  resolution: ConflictResolution;
  /** The sequenced change actually committed (present unless rejected). */
  change?: SequencedChange;
  /** The winning change when a conflict was resolved against another writer. */
  winner?: 'incoming' | 'existing';
  reason?: string;
}

/** Payload a reconnecting client sends to catch up. */
export interface ReconcileRequest {
  clinicId: string;
  /** Last server sequence number the client successfully processed. */
  sinceSeq: number;
  /** Optional resource filter. */
  resources?: string[];
}

export interface ReconcileResponse {
  changes: SequencedChange[];
  /** Latest sequence number available; client should treat this as its new cursor. */
  currentSeq: number;
  /** True when the client's cursor was too old and a full resync is required. */
  resyncRequired: boolean;
}
