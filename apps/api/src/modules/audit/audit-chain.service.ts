/**
 * Audit hash chain verification and anchoring (#1494).
 *
 * - `verifyChain` walks one chain (optionally limited to a time range), recomputes
 *   every hash and reports modified, missing or re-ordered entries.
 * - `verifyAllChains` is the scheduled job: it verifies every chain and alerts
 *   super admins and the affected clinic's admins when a chain is broken.
 * - `anchorChainHeads` optionally publishes a daily digest of every chain head on
 *   Stellar (`AUDIT_CHAIN_STELLAR_ANCHOR=true`), giving proof that does not depend
 *   on anyone who can write to our database.
 */
import crypto from 'crypto';
import { Types } from 'mongoose';
import { AuditLogModel } from './audit.model';
import { AuditChainAnchorModel, AuditChainHeadModel } from './audit-chain.model';
import { GENESIS_HASH, GLOBAL_CHAIN_ID, computeEntryHash } from './audit-chain.plugin';
import { UserModel } from '../auth/models/user.model';
import { createNotification } from '../notifications/notification.service';
import { stellarClient } from '../payments/services/stellar-client';
import logger from '@api/utils/logger';

export type ChainBreakReason =
  | 'HASH_MISMATCH' // entry contents no longer match its stored hash
  | 'PREV_HASH_MISMATCH' // entry does not link to the previous entry's hash
  | 'SEQUENCE_GAP' // one or more entries were deleted
  | 'HEAD_MISMATCH'; // most recent entries deleted, or the chain head was altered

export interface ChainBreak {
  chainId: string;
  chainSeq: number;
  entryId?: string;
  reason: ChainBreakReason;
}

export interface ChainVerification {
  chainId: string;
  fromSeq: number | null;
  toSeq: number | null;
  entriesChecked: number;
  valid: boolean;
  breaks: ChainBreak[];
}

export interface VerifyRange {
  from?: Date;
  to?: Date;
}

const MAX_REPORTED_BREAKS = 100;
/** Appends commit the head just before inserting the entry; ignore that window. */
const HEAD_SETTLE_MS = 60_000;
export const ANCHOR_DATA_NAME = 'hw:audit-chain-root';

type ChainEntry = Record<string, unknown> & {
  _id: Types.ObjectId;
  chainSeq: number;
  prevHash?: string;
  hash?: string;
};

async function seqBound(chainId: string, range: VerifyRange, dir: 1 | -1) {
  const filter: Record<string, unknown> = { chainId, chainSeq: { $exists: true } };
  const ts: Record<string, Date> = {};
  if (range.from) ts.$gte = range.from;
  if (range.to) ts.$lte = range.to;
  if (Object.keys(ts).length) filter.timestamp = ts;
  const doc = await AuditLogModel.findOne(filter)
    .sort({ chainSeq: dir })
    .select('chainSeq')
    .lean<{ chainSeq: number } | null>();
  return doc?.chainSeq ?? null;
}

/**
 * Verify one chain. Entries are walked by sequence number between the first and
 * last entry inside the time range, so every entry in that span is checked even
 * if its timestamp is slightly out of order.
 */
export async function verifyChain(
  chainId: string,
  range: VerifyRange = {}
): Promise<ChainVerification> {
  const breaks: ChainBreak[] = [];
  const report = (b: ChainBreak) => {
    if (breaks.length < MAX_REPORTED_BREAKS) breaks.push(b);
  };

  const [fromSeq, toSeq] = await Promise.all([
    seqBound(chainId, range, 1),
    seqBound(chainId, range, -1),
  ]);

  let entriesChecked = 0;
  let expectedSeq = fromSeq ?? 1;
  let expectedPrev: string | null = GENESIS_HASH;
  let lastHash: string | null = null;

  if (fromSeq !== null && toSeq !== null) {
    if (fromSeq > 1) {
      const prev = await AuditLogModel.findOne({ chainId, chainSeq: fromSeq - 1 })
        .select('hash')
        .lean<{ hash?: string } | null>();
      if (!prev) report({ chainId, chainSeq: fromSeq - 1, reason: 'SEQUENCE_GAP' });
      expectedPrev = prev?.hash ?? null;
    }

    const cursor = AuditLogModel.find({ chainId, chainSeq: { $gte: fromSeq, $lte: toSeq } })
      .sort({ chainSeq: 1 })
      .lean<ChainEntry[]>()
      .cursor();

    for await (const entry of cursor as AsyncIterable<ChainEntry>) {
      entriesChecked++;
      const entryId = String(entry._id);

      if (entry.chainSeq !== expectedSeq) {
        report({ chainId, chainSeq: expectedSeq, reason: 'SEQUENCE_GAP' });
        expectedPrev = null; // the missing entry's hash is unknown
      }
      if (expectedPrev !== null && entry.prevHash !== expectedPrev) {
        report({ chainId, chainSeq: entry.chainSeq, entryId, reason: 'PREV_HASH_MISMATCH' });
      }
      if (!entry.hash || computeEntryHash(entry.prevHash ?? '', entry) !== entry.hash) {
        report({ chainId, chainSeq: entry.chainSeq, entryId, reason: 'HASH_MISMATCH' });
      }

      expectedPrev = entry.hash ?? null;
      expectedSeq = entry.chainSeq + 1;
      lastHash = entry.hash ?? null;
    }
  }

  // Without an upper bound the walk reached the end of the chain, so it must match the head.
  if (!range.to) {
    const head = await AuditChainHeadModel.findOne({ chainId }).lean();
    const lastSeq = toSeq ?? (await seqBound(chainId, {}, -1)) ?? 0;
    if (head) {
      const settled = Date.now() - new Date(head.updatedAt).getTime() > HEAD_SETTLE_MS;
      if (head.seq === lastSeq && lastHash !== null && head.hash !== lastHash) {
        report({ chainId, chainSeq: head.seq, reason: 'HEAD_MISMATCH' });
      } else if ((head.seq > lastSeq && settled) || head.seq < lastSeq) {
        report({ chainId, chainSeq: head.seq, reason: 'HEAD_MISMATCH' });
      }
    }
  }

  return { chainId, fromSeq, toSeq, entriesChecked, valid: breaks.length === 0, breaks };
}

async function alertChainBreak(result: ChainVerification): Promise<void> {
  logger.error(
    { chainId: result.chainId, breaks: result.breaks },
    'Audit log hash chain integrity violation detected'
  );

  const recipients = await UserModel.find({
    isActive: true,
    $or: [
      { role: 'SUPER_ADMIN' },
      ...(Types.ObjectId.isValid(result.chainId) && result.chainId !== GLOBAL_CHAIN_ID
        ? [{ role: 'CLINIC_ADMIN', clinicId: new Types.ObjectId(result.chainId) }]
        : []),
    ],
  })
    .select('_id clinicId')
    .lean<{ _id: Types.ObjectId; clinicId: Types.ObjectId }[]>();

  const first = result.breaks[0];
  await Promise.all(
    recipients.map((user) =>
      createNotification({
        userId: user._id,
        clinicId: user.clinicId,
        type: 'system',
        title: 'Audit log tampering detected',
        message: `Audit chain ${result.chainId} failed verification (${result.breaks.length} break(s), first at entry #${first?.chainSeq}: ${first?.reason}).`,
        link: '/compliance/audit-logs',
        metadata: { chainId: result.chainId, breaks: result.breaks.slice(0, 10) },
      }).catch((err) => logger.error({ err }, 'Failed to deliver audit chain alert'))
    )
  );
}

/** Scheduled job: verify every chain end-to-end and alert on any break. */
export async function verifyAllChains(): Promise<{
  chains: number;
  entriesChecked: number;
  broken: string[];
}> {
  const chainIds = await AuditChainHeadModel.distinct('chainId');
  let entriesChecked = 0;
  const broken: string[] = [];

  for (const chainId of chainIds) {
    const result = await verifyChain(String(chainId));
    entriesChecked += result.entriesChecked;
    if (!result.valid) {
      broken.push(result.chainId);
      await alertChainBreak(result);
    }
  }

  logger.info(
    { chains: chainIds.length, entriesChecked, broken: broken.length },
    'Audit chain verification complete'
  );
  return { chains: chainIds.length, entriesChecked, broken };
}

/** SHA-256 over every chain head, one `chainId:seq:hash` line per chain, sorted by chainId. */
export function computeHeadsRoot(heads: { chainId: string; seq: number; hash: string }[]): string {
  const lines = [...heads]
    .sort((a, b) => a.chainId.localeCompare(b.chainId))
    .map((h) => `${h.chainId}:${h.seq}:${h.hash}`);
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

/**
 * Scheduled job: anchor the current chain heads on Stellar. No-op unless
 * `AUDIT_CHAIN_STELLAR_ANCHOR=true`; one anchor per UTC day.
 */
export async function anchorChainHeads(now: Date = new Date()) {
  if (process.env.AUDIT_CHAIN_STELLAR_ANCHOR !== 'true') return null;

  const anchorDate = now.toISOString().slice(0, 10);
  if (await AuditChainAnchorModel.exists({ anchorDate, status: 'ANCHORED' })) return null;

  const heads = (await AuditChainHeadModel.find().select('chainId seq hash').lean()).map((h) => ({
    chainId: h.chainId,
    seq: h.seq,
    hash: h.hash,
  }));
  if (heads.length === 0) return null;

  const rootHash = computeHeadsRoot(heads);
  try {
    const { transactionHash } = await stellarClient.anchorDigest(ANCHOR_DATA_NAME, rootHash);
    logger.info({ anchorDate, rootHash, transactionHash }, 'Audit chain heads anchored on Stellar');
    return AuditChainAnchorModel.findOneAndUpdate(
      { anchorDate },
      { rootHash, heads, transactionHash, status: 'ANCHORED', $unset: { error: 1 } },
      { upsert: true, new: true }
    ).lean();
  } catch (err) {
    logger.error({ err, anchorDate }, 'Failed to anchor audit chain heads');
    return AuditChainAnchorModel.findOneAndUpdate(
      { anchorDate },
      { rootHash, heads, status: 'FAILED', error: (err as Error).message },
      { upsert: true, new: true }
    ).lean();
  }
}
