/**
 * Real-time data synchronization — core engine
 * Issue #1254
 *
 * Responsibilities:
 *   - assign a strictly increasing per-clinic sequence number to every accepted
 *     change (this is the sync cursor clients persist)
 *   - deterministic conflict resolution via last-writer-wins with a stable
 *     tiebreak, so every replica converges to the same result
 *   - state reconciliation: hand a reconnecting client every change it missed,
 *     or tell it to do a full resync when its cursor has aged out of the buffer
 *
 * State is process-local. For a multi-instance deployment back this with Redis
 * streams (one stream per clinic) — the public API here is deliberately small so
 * that swap is contained.
 */
import { randomUUID } from 'crypto';
import type {
  SyncChange,
  SequencedChange,
  ApplyResult,
  ReconcileRequest,
  ReconcileResponse,
} from './sync.types';

/** Per-clinic in-memory log. `buffer` is a bounded ring of recent changes. */
interface ClinicLog {
  seq: number;
  buffer: SequencedChange[];
  /** recordKey -> current version */
  versions: Map<string, number>;
  /** recordKey -> the change that last won, for conflict comparison */
  lastChange: Map<string, SequencedChange>;
  /** changeId set for idempotency (bounded, trimmed with the buffer) */
  seen: Set<string>;
}

const MAX_BUFFER = 5000;
const logs = new Map<string, ClinicLog>();

function getLog(clinicId: string): ClinicLog {
  let log = logs.get(clinicId);
  if (!log) {
    log = { seq: 0, buffer: [], versions: new Map(), lastChange: new Map(), seen: new Set() };
    logs.set(clinicId, log);
  }
  return log;
}

function recordKey(resource: string, recordId: string): string {
  return `${resource}:${recordId}`;
}

/**
 * Deterministic ordering of two competing changes to the same record.
 * Returns the change that should win. Pure + total order: same inputs always
 * yield the same winner on every node.
 */
export function resolveConflict(a: SyncChange, b: SyncChange): SyncChange {
  if (a.originTs !== b.originTs) return a.originTs > b.originTs ? a : b;
  // Same millisecond — fall back to a stable, node-independent tiebreak.
  return a.changeId > b.changeId ? a : b;
}

/**
 * Apply an incoming change. Never throws for business conflicts — returns an
 * {@link ApplyResult} describing what happened.
 */
export function applyChange(incoming: SyncChange): ApplyResult {
  const log = getLog(incoming.clinicId);
  const key = recordKey(incoming.resource, incoming.recordId);

  // Idempotency — a client re-sending after a flaky ack must not double-apply.
  if (log.seen.has(incoming.changeId)) {
    const existing = log.buffer.find((c) => c.changeId === incoming.changeId);
    return { resolution: 'applied', change: existing, reason: 'duplicate' };
  }

  const currentVersion = log.versions.get(key) ?? 0;

  let resolution: ApplyResult['resolution'] = 'applied';
  let winnerLabel: ApplyResult['winner'];

  if (incoming.baseVersion < currentVersion) {
    // The client edited a stale copy — a concurrent writer got there first.
    const existing = log.lastChange.get(key);
    const winner = existing ? resolveConflict(incoming, existing) : incoming;
    if (existing && winner.changeId === existing.changeId) {
      return {
        resolution: 'rejected',
        winner: 'existing',
        reason: `stale write: baseVersion ${incoming.baseVersion} < current ${currentVersion}`,
      };
    }
    resolution = 'merged';
    winnerLabel = 'incoming';
  }

  const seq = ++log.seq;
  const version = currentVersion + 1;
  const sequenced: SequencedChange = {
    ...incoming,
    seq,
    version,
    serverTs: Date.now(),
  };

  log.versions.set(key, version);
  log.lastChange.set(key, sequenced);
  log.seen.add(incoming.changeId);
  log.buffer.push(sequenced);

  if (log.buffer.length > MAX_BUFFER) {
    const dropped = log.buffer.splice(0, log.buffer.length - MAX_BUFFER);
    for (const d of dropped) log.seen.delete(d.changeId);
  }

  return { resolution, change: sequenced, winner: winnerLabel };
}

/** Current sync cursor (highest sequence number) for a clinic. */
export function currentSeq(clinicId: string): number {
  return getLog(clinicId).seq;
}

/**
 * State reconciliation for a reconnecting client.
 * If `sinceSeq` predates the oldest buffered change the client must resync from
 * source-of-truth (the REST API); otherwise it gets an ordered delta.
 */
export function reconcile(req: ReconcileRequest): ReconcileResponse {
  const log = getLog(req.clinicId);
  const oldest = log.buffer.length > 0 ? log.buffer[0].seq : log.seq;

  if (req.sinceSeq > 0 && req.sinceSeq < oldest - 1) {
    return { changes: [], currentSeq: log.seq, resyncRequired: true };
  }

  let changes = log.buffer.filter((c) => c.seq > req.sinceSeq);
  if (req.resources && req.resources.length > 0) {
    const allow = new Set(req.resources);
    changes = changes.filter((c) => allow.has(c.resource));
  }

  return { changes, currentSeq: log.seq, resyncRequired: false };
}

/** Test / ops helper — wipe a clinic's log (or everything). */
export function resetSyncState(clinicId?: string): void {
  if (clinicId) logs.delete(clinicId);
  else logs.clear();
}

/** Convenience for callers (e.g. REST controllers) that emit server-side changes. */
export function makeChange(
  partial: Omit<SyncChange, 'changeId' | 'originTs'> &
    Partial<Pick<SyncChange, 'changeId' | 'originTs'>>
): SyncChange {
  return {
    ...partial,
    changeId: partial.changeId ?? randomUUID(),
    originTs: partial.originTs ?? Date.now(),
  };
}
