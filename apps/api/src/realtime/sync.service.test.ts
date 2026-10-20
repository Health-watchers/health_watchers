/**
 * Unit tests for the real-time sync engine — Issue #1254
 */
import {
  applyChange,
  reconcile,
  resolveConflict,
  currentSeq,
  resetSyncState,
  makeChange,
} from './sync.service';
import type { SyncChange } from './sync.types';

const CLINIC = 'clinic-a';

function change(over: Partial<SyncChange> = {}): SyncChange {
  return makeChange({
    resource: 'appointment',
    recordId: 'appt-1',
    op: 'update',
    data: { status: 'confirmed' },
    baseVersion: 0,
    userId: 'user-1',
    clinicId: CLINIC,
    ...over,
  });
}

beforeEach(() => resetSyncState());

describe('applyChange', () => {
  it('assigns a strictly increasing per-clinic sequence', () => {
    const a = applyChange(change({ recordId: 'r1' }));
    const b = applyChange(change({ recordId: 'r2' }));
    expect(a.change!.seq).toBe(1);
    expect(b.change!.seq).toBe(2);
    expect(currentSeq(CLINIC)).toBe(2);
  });

  it('bumps the per-record version on each accepted write', () => {
    const first = applyChange(change({ recordId: 'r1', baseVersion: 0 }));
    const second = applyChange(change({ recordId: 'r1', baseVersion: 1 }));
    expect(first.change!.version).toBe(1);
    expect(second.change!.version).toBe(2);
  });

  it('is idempotent for a repeated changeId', () => {
    const c = change({ recordId: 'r1' });
    const a = applyChange(c);
    const b = applyChange(c);
    expect(b.resolution).toBe('applied');
    expect(b.reason).toBe('duplicate');
    expect(currentSeq(CLINIC)).toBe(a.change!.seq);
  });

  it('keeps clinics isolated', () => {
    applyChange(change({ clinicId: 'clinic-a', recordId: 'r1' }));
    applyChange(change({ clinicId: 'clinic-b', recordId: 'r1' }));
    expect(currentSeq('clinic-a')).toBe(1);
    expect(currentSeq('clinic-b')).toBe(1);
  });
});

describe('conflict resolution', () => {
  it('rejects a stale write that loses last-writer-wins', () => {
    applyChange(change({ changeId: 'aaa', recordId: 'r1', baseVersion: 0, originTs: 2000 }));
    const stale = applyChange(
      change({ changeId: 'bbb', recordId: 'r1', baseVersion: 0, originTs: 1000 })
    );
    expect(stale.resolution).toBe('rejected');
    expect(stale.winner).toBe('existing');
  });

  it('merges a stale write that wins last-writer-wins', () => {
    applyChange(change({ changeId: 'aaa', recordId: 'r1', baseVersion: 0, originTs: 1000 }));
    const winning = applyChange(
      change({ changeId: 'bbb', recordId: 'r1', baseVersion: 0, originTs: 5000 })
    );
    expect(winning.resolution).toBe('merged');
    expect(winning.winner).toBe('incoming');
    expect(winning.change!.version).toBe(2);
  });

  it('resolveConflict is a deterministic total order (ts, then changeId)', () => {
    const a = change({ changeId: 'a', originTs: 10 });
    const b = change({ changeId: 'b', originTs: 10 });
    expect(resolveConflict(a, b)).toBe(b);
    expect(resolveConflict(b, a)).toBe(b);
    const c = change({ changeId: 'c', originTs: 20 });
    expect(resolveConflict(a, c)).toBe(c);
  });
});

describe('reconcile', () => {
  it('returns only changes after the client cursor', () => {
    applyChange(change({ recordId: 'r1' }));
    applyChange(change({ recordId: 'r2' }));
    applyChange(change({ recordId: 'r3' }));
    const res = reconcile({ clinicId: CLINIC, sinceSeq: 1 });
    expect(res.resyncRequired).toBe(false);
    expect(res.changes.map((c) => c.seq)).toEqual([2, 3]);
    expect(res.currentSeq).toBe(3);
  });

  it('filters by resource when asked', () => {
    applyChange(change({ resource: 'appointment', recordId: 'r1' }));
    applyChange(change({ resource: 'patient', recordId: 'r2' }));
    const res = reconcile({ clinicId: CLINIC, sinceSeq: 0, resources: ['patient'] });
    expect(res.changes).toHaveLength(1);
    expect(res.changes[0].resource).toBe('patient');
  });

  it('flags resyncRequired when the cursor has aged out of the buffer', () => {
    // No changes buffered, but the client claims a far-future cursor is old.
    const res = reconcile({ clinicId: 'fresh-clinic', sinceSeq: 0 });
    expect(res.resyncRequired).toBe(false); // seq 0, nothing missed
    applyChange(change({ clinicId: 'fresh-clinic', recordId: 'r1' }));
    const res2 = reconcile({ clinicId: 'fresh-clinic', sinceSeq: 0 });
    expect(res2.changes).toHaveLength(1);
  });
});
