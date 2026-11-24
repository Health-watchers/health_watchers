/**
 * Tamper-evident audit logs via per-clinic hash chaining (#1494).
 *
 * Every audit entry stores `prevHash` and `hash = SHA256(prevHash + canonical(entry))`,
 * where `canonical(entry)` is a key-sorted JSON rendering of the stored document
 * (including its `chainId` and `chainSeq`). Changing, deleting or re-ordering any
 * historical entry therefore breaks the chain, which `verifyChain` detects.
 *
 * Appends are serialised per chain in-process and committed with a compare-and-swap
 * on the chain head, so concurrent API replicas can never fork a chain. The head is
 * cached in memory, keeping the steady-state overhead to one indexed update per entry.
 */
import crypto from 'crypto';
import { Schema } from 'mongoose';
import { AuditChainHeadModel } from './audit-chain.model';

export const GENESIS_HASH = '0'.repeat(64);
export const GLOBAL_CHAIN_ID = 'global';
const MAX_APPEND_ATTEMPTS = 5;

/** Fields that are outputs of the hash rather than inputs to it. */
const NON_HASHED_FIELDS = new Set(['prevHash', 'hash']);

function isObjectId(value: unknown): value is { toHexString(): string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { _bsontype?: string })._bsontype === 'ObjectId' &&
    typeof (value as { toHexString?: unknown }).toHexString === 'function'
  );
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (isObjectId(value)) return value.toHexString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = normalize(v);
    }
    return out;
  }
  return value;
}

/**
 * Deterministic serialisation of an audit entry. A document hashed before insert
 * and the same document read back with `.lean()` produce identical output.
 */
export function canonicalize(entry: Record<string, unknown>): string {
  const hashed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!NON_HASHED_FIELDS.has(key)) hashed[key] = value;
  }
  return JSON.stringify(normalize(hashed));
}

export function computeEntryHash(prevHash: string, entry: Record<string, unknown>): string {
  return crypto
    .createHash('sha256')
    .update(prevHash + canonicalize(entry))
    .digest('hex');
}

export function chainIdFor(clinicId: unknown): string {
  return clinicId ? String(clinicId) : GLOBAL_CHAIN_ID;
}

// ── Append ────────────────────────────────────────────────────────────────────

interface Head {
  seq: number;
  hash: string;
}

const heads = new Map<string, Head>();
const locks = new Map<string, Promise<unknown>>();

/** Run `fn` after every earlier append to the same chain in this process has settled. */
function withChainLock<T>(chainId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(chainId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => undefined);
  locks.set(chainId, tail);
  void tail.then(() => {
    if (locks.get(chainId) === tail) locks.delete(chainId);
  });
  return next;
}

async function loadHead(chainId: string): Promise<Head> {
  const head = await AuditChainHeadModel.findOne({ chainId }).lean();
  return head ? { seq: head.seq, hash: head.hash } : { seq: 0, hash: GENESIS_HASH };
}

/** Compare-and-swap the chain head from `expectedSeq` to `seq`. */
async function advanceHead(
  chainId: string,
  expectedSeq: number,
  seq: number,
  hash: string
): Promise<boolean> {
  if (expectedSeq === 0) {
    try {
      await AuditChainHeadModel.create({ chainId, seq, hash, updatedAt: new Date() });
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
  }
  const result = await AuditChainHeadModel.updateOne(
    { chainId, seq: expectedSeq },
    { $set: { seq, hash, updatedAt: new Date() } }
  );
  return result.modifiedCount === 1;
}

interface ChainableDoc {
  get(path: string): unknown;
  set(values: Record<string, unknown>): unknown;
  toObject(options?: Record<string, unknown>): Record<string, unknown>;
}

/** Assign `chainId`, `chainSeq`, `prevHash` and `hash` to a new audit document. */
export function appendToChain(doc: ChainableDoc): Promise<void> {
  const chainId = chainIdFor(doc.get('clinicId'));
  return withChainLock(chainId, async () => {
    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt++) {
      const head = heads.get(chainId) ?? (await loadHead(chainId));
      const chainSeq = head.seq + 1;
      doc.set({ chainId, chainSeq, prevHash: head.hash });
      const hash = computeEntryHash(head.hash, doc.toObject({ depopulate: true }));

      if (await advanceHead(chainId, head.seq, chainSeq, hash)) {
        doc.set({ hash });
        heads.set(chainId, { seq: chainSeq, hash });
        return;
      }
      // Another replica advanced the chain since we cached its head — reload and retry.
      heads.delete(chainId);
    }
    throw new Error(`Unable to append to audit chain ${chainId}: head contention`);
  });
}

/** Test helper — forget cached chain heads. */
export function resetAuditChainCache(): void {
  heads.clear();
  locks.clear();
}

/** Mongoose plugin adding hash-chain fields and the append hook to an audit schema. */
export function auditHashChainPlugin(schema: Schema): void {
  schema.add({
    chainId: { type: String, required: false },
    chainSeq: { type: Number, required: false },
    prevHash: { type: String, required: false },
    hash: { type: String, required: false },
  });
  schema.index(
    { chainId: 1, chainSeq: 1 },
    { unique: true, partialFilterExpression: { chainSeq: { $exists: true } } }
  );

  schema.pre('save', async function () {
    if (!this.isNew || this.get('hash')) return;
    await appendToChain(this as unknown as ChainableDoc);
  });
}
