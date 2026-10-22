/**
 * Tamper-evident audit log hash chain (#1494).
 * Mongo is replaced with in-memory fakes of the audit and chain-head collections.
 */

type Row = Record<string, any>;

const store: { logs: Row[]; heads: Row[]; anchors: Row[] } = { logs: [], heads: [], anchors: [] };

function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('$exists' in cond) return (value !== undefined) === cond.$exists;
      if ('$gte' in cond && !(value >= cond.$gte)) return false;
      if ('$lte' in cond && !(value <= cond.$lte)) return false;
      return true;
    }
    return value === cond;
  });
}

/** Chainable stand-in for a mongoose query over `rows`. */
function query(rows: () => Row[], single: boolean) {
  let sortSpec: Row | null = null;
  const result = () => {
    const out = [...rows()];
    if (sortSpec) {
      const [[key, dir]] = Object.entries(sortSpec);
      out.sort((a, b) => (a[key] - b[key]) * (dir as number));
    }
    return single ? (out[0] ?? null) : out;
  };
  const q: any = {
    sort: (spec: Row) => ((sortSpec = spec), q),
    select: () => q,
    lean: () => q,
    cursor: () => (async function* () {
      for (const row of result() as Row[]) yield row;
    })(),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return q;
}

jest.mock('./audit.model', () => ({
  AuditLogModel: {
    findOne: (filter: Row) => query(() => store.logs.filter((r) => matches(r, filter)), true),
    find: (filter: Row) => query(() => store.logs.filter((r) => matches(r, filter)), false),
  },
}));

jest.mock('./audit-chain.model', () => ({
  AuditChainHeadModel: {
    findOne: (filter: Row) => query(() => store.heads.filter((r) => matches(r, filter)), true),
    find: () => query(() => store.heads, false),
    distinct: async (field: string) => store.heads.map((h) => h[field]),
    create: async (doc: Row) => {
      if (store.heads.some((h) => h.chainId === doc.chainId)) {
        throw Object.assign(new Error('duplicate key'), { code: 11000 });
      }
      store.heads.push({ ...doc });
      return doc;
    },
    updateOne: async (filter: Row, update: { $set: Row }) => {
      const head = store.heads.find((h) => matches(h, filter));
      if (!head) return { modifiedCount: 0 };
      Object.assign(head, update.$set);
      return { modifiedCount: 1 };
    },
  },
  AuditChainAnchorModel: {
    exists: async (filter: Row) => store.anchors.some((a) => matches(a, filter)),
    findOneAndUpdate: (filter: Row, update: Row) => {
      const existing = store.anchors.find((a) => matches(a, filter));
      const { $unset, ...set } = update;
      const doc = Object.assign(existing ?? { ...filter }, set);
      if ($unset) for (const k of Object.keys($unset)) delete doc[k];
      if (!existing) store.anchors.push(doc);
      return { lean: async () => doc };
    },
  },
}));

const createNotification = jest.fn().mockResolvedValue(null);
jest.mock('../notifications/notification.service', () => ({
  createNotification: (...args: unknown[]) => createNotification(...args),
}));

const adminUsers = [{ _id: 'admin-1', clinicId: 'clinic-a' }];
jest.mock('../auth/models/user.model', () => ({
  UserModel: { find: () => ({ select: () => ({ lean: async () => adminUsers }) }) },
}));

const anchorDigest = jest.fn();
jest.mock('../payments/services/stellar-client', () => ({
  stellarClient: { anchorDigest: (...args: unknown[]) => anchorDigest(...args) },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { Types } from 'mongoose';
import {
  GENESIS_HASH,
  appendToChain,
  canonicalize,
  computeEntryHash,
  resetAuditChainCache,
} from './audit-chain.plugin';
import {
  anchorChainHeads,
  computeHeadsRoot,
  verifyAllChains,
  verifyChain,
} from './audit-chain.service';

const CLINIC_A = new Types.ObjectId();
const CLINIC_B = new Types.ObjectId();
const BASE_TIME = Date.parse('2026-01-01T00:00:00Z');

/** Minimal stand-in for a new mongoose document passing through the pre-save hook. */
class FakeDoc {
  constructor(private data: Row) {}
  get(path: string) {
    return this.data[path];
  }
  set(values: Row) {
    Object.assign(this.data, values);
  }
  toObject() {
    return { ...this.data };
  }
}

let counter = 0;

async function writeEntry(clinicId: Types.ObjectId | undefined, overrides: Row = {}) {
  counter++;
  const doc = new FakeDoc({
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    clinicId,
    action: 'PATIENT_VIEW',
    resourceType: 'Patient',
    resourceId: `patient-${counter}`,
    outcome: 'SUCCESS',
    metadata: { reason: 'routine', nested: { b: 2, a: 1 } },
    timestamp: new Date(BASE_TIME + counter * 60_000),
    ...overrides,
  });
  await appendToChain(doc);
  const stored = doc.toObject();
  store.logs.push(stored);
  return stored;
}

async function writeEntries(clinicId: Types.ObjectId | undefined, n: number) {
  const out: Row[] = [];
  for (let i = 0; i < n; i++) out.push(await writeEntry(clinicId));
  return out;
}

/** Age every chain head past the verifier's in-flight append window. */
function settleHeads() {
  for (const head of store.heads) head.updatedAt = new Date(Date.now() - 5 * 60_000);
}

beforeEach(() => {
  store.logs = [];
  store.heads = [];
  store.anchors = [];
  counter = 0;
  resetAuditChainCache();
  jest.clearAllMocks();
  delete process.env.AUDIT_CHAIN_STELLAR_ANCHOR;
});

describe('canonicalize', () => {
  it('is independent of key order and ignores hash outputs', () => {
    const a = { b: 1, a: { y: 2, x: 1 }, hash: 'h1', prevHash: 'p1' };
    const b = { a: { x: 1, y: 2 }, b: 1, hash: 'h2' };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('renders ObjectIds and Dates the same before insert and after a lean read', () => {
    const id = new Types.ObjectId();
    const when = new Date('2026-02-03T04:05:06.789Z');
    expect(canonicalize({ id, when })).toBe(
      canonicalize({ id: new Types.ObjectId(id.toHexString()), when: new Date(when.getTime()) })
    );
    expect(canonicalize({ id, when })).toBe(
      JSON.stringify({ id: id.toHexString(), when: when.toISOString() })
    );
  });

  it('drops undefined fields', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
  });
});

describe('appendToChain', () => {
  it('links each entry to the previous hash, starting from the genesis hash', async () => {
    const entries = await writeEntries(CLINIC_A, 5);

    expect(entries.map((e) => e.chainSeq)).toEqual([1, 2, 3, 4, 5]);
    expect(entries[0].prevHash).toBe(GENESIS_HASH);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].prevHash).toBe(entries[i - 1].hash);
    }
    for (const entry of entries) {
      expect(entry.hash).toBe(computeEntryHash(entry.prevHash, entry));
      expect(entry.chainId).toBe(String(CLINIC_A));
    }
    expect(store.heads).toEqual([
      expect.objectContaining({ chainId: String(CLINIC_A), seq: 5, hash: entries[4].hash }),
    ]);
  });

  it('keeps an independent chain per clinic and a global chain for clinic-less entries', async () => {
    await writeEntries(CLINIC_A, 3);
    const b = await writeEntries(CLINIC_B, 2);
    const global = await writeEntry(undefined);

    expect(b.map((e) => e.chainSeq)).toEqual([1, 2]);
    expect(b[0].prevHash).toBe(GENESIS_HASH);
    expect(global.chainId).toBe('global');
    expect(global.chainSeq).toBe(1);
  });

  it('serialises concurrent appends to the same chain', async () => {
    const entries = await Promise.all(
      Array.from({ length: 25 }, () => writeEntry(CLINIC_A))
    );
    const seqs = entries.map((e) => e.chainSeq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    settleHeads();
    expect((await verifyChain(String(CLINIC_A))).valid).toBe(true);
  });

  it('reloads the head and retries when another replica advanced the chain', async () => {
    await writeEntries(CLINIC_A, 2);
    // Another replica appends entry #3 behind this process's cached head.
    const head = store.heads[0];
    const foreign = {
      _id: new Types.ObjectId(),
      clinicId: CLINIC_A,
      action: 'PATIENT_VIEW',
      outcome: 'SUCCESS',
      timestamp: new Date(BASE_TIME),
      chainId: String(CLINIC_A),
      chainSeq: 3,
      prevHash: head.hash,
    } as Row;
    foreign.hash = computeEntryHash(head.hash, foreign);
    store.logs.push(foreign);
    Object.assign(head, { seq: 3, hash: foreign.hash });

    const next = await writeEntry(CLINIC_A);
    expect(next.chainSeq).toBe(4);
    expect(next.prevHash).toBe(foreign.hash);
  });
});

describe('verifyChain', () => {
  it('accepts an untouched chain', async () => {
    await writeEntries(CLINIC_A, 10);
    settleHeads();
    const result = await verifyChain(String(CLINIC_A));
    expect(result).toMatchObject({ valid: true, entriesChecked: 10, fromSeq: 1, toSeq: 10 });
    expect(result.breaks).toEqual([]);
  });

  it('detects modification of any historical entry', async () => {
    await writeEntries(CLINIC_A, 6);
    settleHeads();

    const tamperings: ((row: Row) => void)[] = [
      (row) => (row.action = 'PATIENT_DELETE'),
      (row) => (row.userId = new Types.ObjectId()),
      (row) => (row.metadata = { ...row.metadata, reason: 'edited' }),
      (row) => (row.timestamp = new Date(row.timestamp.getTime() + 1)),
      (row) => (row.outcome = 'FAILURE'),
      (row) => delete row.resourceId,
    ];

    for (let i = 0; i < store.logs.length; i++) {
      const original = { ...store.logs[i], metadata: { ...store.logs[i].metadata } };
      tamperings[i](store.logs[i]);

      const result = await verifyChain(String(CLINIC_A));
      expect(result.valid).toBe(false);
      expect(result.breaks).toContainEqual(
        expect.objectContaining({ chainSeq: i + 1, reason: 'HASH_MISMATCH' })
      );

      store.logs[i] = original;
    }
    expect((await verifyChain(String(CLINIC_A))).valid).toBe(true);
  });

  it('detects an edited entry whose hash was recomputed to hide the change', async () => {
    await writeEntries(CLINIC_A, 4);
    settleHeads();
    const row = store.logs[1];
    row.action = 'PATIENT_DELETE';
    row.hash = computeEntryHash(row.prevHash, row);

    const result = await verifyChain(String(CLINIC_A));
    expect(result.valid).toBe(false);
    expect(result.breaks).toContainEqual(
      expect.objectContaining({ chainSeq: 3, reason: 'PREV_HASH_MISMATCH' })
    );
  });

  it('detects a deleted entry in the middle of the chain', async () => {
    await writeEntries(CLINIC_A, 5);
    settleHeads();
    store.logs.splice(2, 1);

    const result = await verifyChain(String(CLINIC_A));
    expect(result.valid).toBe(false);
    expect(result.breaks).toContainEqual(
      expect.objectContaining({ chainSeq: 3, reason: 'SEQUENCE_GAP' })
    );
  });

  it('detects deletion of the most recent entries against the chain head', async () => {
    await writeEntries(CLINIC_A, 5);
    settleHeads();
    store.logs.splice(3, 2);

    const result = await verifyChain(String(CLINIC_A));
    expect(result.valid).toBe(false);
    expect(result.breaks).toContainEqual(
      expect.objectContaining({ chainSeq: 5, reason: 'HEAD_MISMATCH' })
    );
  });

  it('does not flag an append that is still in flight', async () => {
    await writeEntries(CLINIC_A, 3);
    // Head advanced moments ago but the entry has not been inserted yet.
    Object.assign(store.heads[0], { seq: 4, hash: 'f'.repeat(64), updatedAt: new Date() });
    expect((await verifyChain(String(CLINIC_A))).valid).toBe(true);
  });

  it('verifies only the requested time range, linking it to the entry before it', async () => {
    const entries = await writeEntries(CLINIC_A, 10);
    settleHeads();

    const result = await verifyChain(String(CLINIC_A), {
      from: entries[3].timestamp,
      to: entries[6].timestamp,
    });
    expect(result).toMatchObject({ valid: true, fromSeq: 4, toSeq: 7, entriesChecked: 4 });

    // Tampering outside the range is out of scope; inside it is detected.
    store.logs[0].action = 'PATIENT_DELETE';
    expect(
      (await verifyChain(String(CLINIC_A), { from: entries[3].timestamp, to: entries[6].timestamp }))
        .valid
    ).toBe(true);
    store.logs[5].action = 'PATIENT_DELETE';
    expect(
      (await verifyChain(String(CLINIC_A), { from: entries[3].timestamp, to: entries[6].timestamp }))
        .valid
    ).toBe(false);
  });

  it('reports an empty range as valid', async () => {
    await writeEntries(CLINIC_A, 2);
    settleHeads();
    const result = await verifyChain(String(CLINIC_A), {
      from: new Date(BASE_TIME + 365 * 86_400_000),
    });
    expect(result).toMatchObject({ valid: true, entriesChecked: 0 });
  });
});

describe('verifyAllChains', () => {
  it('alerts admins only for broken chains', async () => {
    await writeEntries(CLINIC_A, 3);
    await writeEntries(CLINIC_B, 3);
    settleHeads();
    store.logs.find((r) => r.chainId === String(CLINIC_B) && r.chainSeq === 2)!.action =
      'PATIENT_DELETE';

    const summary = await verifyAllChains();

    expect(summary).toEqual({ chains: 2, entriesChecked: 6, broken: [String(CLINIC_B)] });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        type: 'system',
        title: 'Audit log tampering detected',
        metadata: expect.objectContaining({ chainId: String(CLINIC_B) }),
      })
    );
  });

  it('stays quiet when every chain is intact', async () => {
    await writeEntries(CLINIC_A, 3);
    settleHeads();
    await verifyAllChains();
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe('anchorChainHeads', () => {
  it('does nothing unless Stellar anchoring is enabled', async () => {
    await writeEntries(CLINIC_A, 1);
    expect(await anchorChainHeads()).toBeNull();
    expect(anchorDigest).not.toHaveBeenCalled();
  });

  it('anchors a digest of every chain head once per day', async () => {
    process.env.AUDIT_CHAIN_STELLAR_ANCHOR = 'true';
    await writeEntries(CLINIC_A, 2);
    await writeEntries(CLINIC_B, 1);
    anchorDigest.mockResolvedValue({ transactionHash: 'tx-1' });

    const now = new Date('2026-03-01T00:30:00Z');
    const anchor = await anchorChainHeads(now);
    const expectedRoot = computeHeadsRoot(
      store.heads.map((h) => ({ chainId: h.chainId, seq: h.seq, hash: h.hash }))
    );

    expect(anchorDigest).toHaveBeenCalledWith('hw:audit-chain-root', expectedRoot);
    expect(anchor).toMatchObject({
      anchorDate: '2026-03-01',
      rootHash: expectedRoot,
      transactionHash: 'tx-1',
      status: 'ANCHORED',
    });

    expect(await anchorChainHeads(now)).toBeNull();
    expect(anchorDigest).toHaveBeenCalledTimes(1);
  });

  it('records a failed anchor so it is retried on the next run', async () => {
    process.env.AUDIT_CHAIN_STELLAR_ANCHOR = 'true';
    await writeEntries(CLINIC_A, 1);
    anchorDigest.mockRejectedValueOnce(new Error('horizon down'));
    const now = new Date('2026-03-02T00:30:00Z');

    expect(await anchorChainHeads(now)).toMatchObject({ status: 'FAILED', error: 'horizon down' });

    anchorDigest.mockResolvedValueOnce({ transactionHash: 'tx-2' });
    expect(await anchorChainHeads(now)).toMatchObject({ status: 'ANCHORED', transactionHash: 'tx-2' });
    expect(store.anchors[0].error).toBeUndefined();
  });

  it('changes the root whenever any chain head changes', () => {
    const heads = [
      { chainId: 'a', seq: 1, hash: 'a'.repeat(64) },
      { chainId: 'b', seq: 1, hash: 'b'.repeat(64) },
    ];
    expect(computeHeadsRoot(heads)).toBe(computeHeadsRoot([...heads].reverse()));
    expect(computeHeadsRoot(heads)).not.toBe(
      computeHeadsRoot([heads[0], { ...heads[1], seq: 2 }])
    );
  });
});

describe('throughput overhead', () => {
  it('hashes an entry far faster than the < 10% budget of a ~1 ms audit insert', () => {
    const entry = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      clinicId: CLINIC_A,
      action: 'PATIENT_VIEW',
      resourceType: 'Patient',
      resourceId: 'patient-1',
      ipAddress: '10.0.0.1',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15',
      requestId: 'req-1',
      outcome: 'SUCCESS',
      metadata: { method: 'GET', path: '/api/v1/patients/1', durationMs: 12 },
      timestamp: new Date(),
      chainId: String(CLINIC_A),
      chainSeq: 1,
    };
    const iterations = 5_000;
    let prev = GENESIS_HASH;
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) prev = computeEntryHash(prev, entry);
    const perEntryMs = Number(process.hrtime.bigint() - start) / 1e6 / iterations;

    expect(perEntryMs).toBeLessThan(0.1);
  });
});
