/**
 * Real-time data synchronization — WebSocket handler
 * Issue #1254
 *
 * Socket protocol (all events are clinic-scoped; the socket is already joined to
 * its `clinic:<id>` room by socket.ts):
 *
 *   client -> server  sync:subscribe   { resources: string[] }
 *   client -> server  sync:push        { changes: SyncChange[] }        (cb -> acks)
 *   client -> server  sync:reconcile   { sinceSeq: number, resources?: string[] }
 *
 *   server -> client  sync:batch       { changes: SequencedChange[] }   (coalesced)
 *   server -> client  sync:delta       { changes, currentSeq }
 *   server -> client  sync:resync-required { currentSeq }
 *
 * Outbound changes are batched per clinic (flush every FLUSH_INTERVAL_MS or when
 * MAX_BATCH is reached) and de-duplicated to the latest change per record to
 * keep bandwidth down on busy clinics.
 */
import { Socket } from 'socket.io';
import { emitToClinic } from './socket';
import { applyChange, reconcile, currentSeq } from './sync.service';
import type { SyncChange, SequencedChange, ApplyResult } from './sync.types';
import {
  syncChangesTotal,
  syncConflictsTotal,
  syncPropagationSeconds,
  syncBatchSize,
  syncReconnectionsTotal,
  syncActiveClients,
} from './sync.metrics';
import logger from '../utils/logger';

const FLUSH_INTERVAL_MS = 50;
const MAX_BATCH = 100;
const MAX_PUSH_CHANGES = 500;

interface SyncContext {
  userId: string;
  clinicId: string;
}

// ── Per-clinic outbound batch queue ─────────────────────────────────────────

interface ClinicQueue {
  pending: Map<string, SequencedChange>; // recordKey -> latest change (dedupe)
  timer: NodeJS.Timeout | null;
}
const queues = new Map<string, ClinicQueue>();

function enqueue(change: SequencedChange): void {
  let q = queues.get(change.clinicId);
  if (!q) {
    q = { pending: new Map(), timer: null };
    queues.set(change.clinicId, q);
  }
  const key = `${change.resource}:${change.recordId}`;
  const existing = q.pending.get(key);
  // Keep only the most recent change per record in a single batch window.
  if (!existing || change.seq > existing.seq) q.pending.set(key, change);

  if (q.pending.size >= MAX_BATCH) {
    flush(change.clinicId);
    return;
  }
  if (!q.timer) {
    q.timer = setTimeout(() => flush(change.clinicId), FLUSH_INTERVAL_MS);
  }
}

function flush(clinicId: string): void {
  const q = queues.get(clinicId);
  if (!q) return;
  if (q.timer) {
    clearTimeout(q.timer);
    q.timer = null;
  }
  if (q.pending.size === 0) return;

  const changes = Array.from(q.pending.values()).sort((a, b) => a.seq - b.seq);
  q.pending.clear();

  syncBatchSize.observe(changes.length);
  const now = Date.now();
  for (const c of changes) {
    syncPropagationSeconds.observe({ resource: c.resource }, Math.max(0, now - c.originTs) / 1000);
  }

  emitToClinic(clinicId, 'sync:batch', { changes });
}

// ── Handler registration ────────────────────────────────────────────────────

export class SyncHandler {
  static registerHandlers(socket: Socket, ctx: SyncContext): void {
    const subscribed = new Set<string>(); // empty = all resources
    syncActiveClients.inc();

    socket.on('sync:subscribe', (data: { resources?: string[] }) => {
      subscribed.clear();
      for (const r of data?.resources ?? []) subscribed.add(r);
      socket.emit('sync:subscribed', {
        resources: Array.from(subscribed),
        currentSeq: currentSeq(ctx.clinicId),
      });
    });

    socket.on(
      'sync:push',
      (data: { changes?: SyncChange[] }, ack?: (res: { acks: PushAck[] }) => void) => {
        const changes = Array.isArray(data?.changes) ? data.changes.slice(0, MAX_PUSH_CHANGES) : [];
        const acks: PushAck[] = [];

        for (const raw of changes) {
          const change = normalise(raw, ctx);
          if (!change) {
            acks.push({
              changeId: raw?.changeId ?? 'unknown',
              resolution: 'rejected',
              reason: 'malformed change',
            });
            continue;
          }

          let result: ApplyResult;
          try {
            result = applyChange(change);
          } catch (err) {
            logger.error({ err, changeId: change.changeId }, 'sync: applyChange threw');
            acks.push({
              changeId: change.changeId,
              resolution: 'rejected',
              reason: 'internal error',
            });
            continue;
          }

          syncChangesTotal.inc({ resource: change.resource, resolution: result.resolution });
          if (result.resolution === 'merged' || result.winner) {
            syncConflictsTotal.inc({
              resource: change.resource,
              winner: result.winner ?? 'incoming',
            });
          }

          acks.push({
            changeId: change.changeId,
            resolution: result.resolution,
            seq: result.change?.seq,
            version: result.change?.version,
            reason: result.reason,
          });

          if (result.change && result.resolution !== 'rejected') {
            enqueue(result.change);
          }
        }

        ack?.({ acks });
      }
    );

    socket.on('sync:reconcile', (data: { sinceSeq?: number; resources?: string[] }) => {
      const sinceSeq = Number.isFinite(data?.sinceSeq) ? Number(data!.sinceSeq) : 0;
      const res = reconcile({
        clinicId: ctx.clinicId,
        sinceSeq,
        resources: data?.resources,
      });

      if (res.resyncRequired) {
        syncReconnectionsTotal.inc({ outcome: 'resync' });
        socket.emit('sync:resync-required', { currentSeq: res.currentSeq });
        return;
      }

      syncReconnectionsTotal.inc({ outcome: 'delta' });
      // Chunk the catch-up delta so a long offline period doesn't ship one huge frame.
      for (let i = 0; i < res.changes.length; i += MAX_BATCH) {
        socket.emit('sync:delta', {
          changes: res.changes.slice(i, i + MAX_BATCH),
          currentSeq: res.currentSeq,
        });
      }
      if (res.changes.length === 0) {
        socket.emit('sync:delta', { changes: [], currentSeq: res.currentSeq });
      }
    });

    socket.on('disconnect', () => {
      syncActiveClients.dec();
    });
  }
}

interface PushAck {
  changeId: string;
  resolution: ApplyResult['resolution'];
  seq?: number;
  version?: number;
  reason?: string;
}

/**
 * Force the identity fields to the authenticated socket's clinic/user so a
 * client cannot push changes into another clinic's stream, and validate shape.
 */
function normalise(raw: SyncChange, ctx: SyncContext): SyncChange | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.changeId || !raw.resource || !raw.recordId || !raw.op) return null;
  if (!['create', 'update', 'delete'].includes(raw.op)) return null;

  return {
    changeId: String(raw.changeId),
    resource: String(raw.resource),
    recordId: String(raw.recordId),
    op: raw.op,
    data: raw.op === 'delete' ? undefined : (raw.data ?? {}),
    baseVersion: Number.isFinite(raw.baseVersion) ? Number(raw.baseVersion) : 0,
    originTs: Number.isFinite(raw.originTs) ? Number(raw.originTs) : Date.now(),
    userId: ctx.userId,
    clinicId: ctx.clinicId,
  };
}

/** Exposed for tests. */
export const __test__ = { enqueue, flush, queues };
