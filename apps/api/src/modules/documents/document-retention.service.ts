/**
 * Document retention & expiration — Issue #1247
 *
 * - `assignRetention` stamps a document with `retainUntil` / `expiresAt` from a
 *   policy (or an explicit override) at upload time.
 * - `runRetentionSweep` is the periodic job: it expires documents past their
 *   `expiresAt`, archives or purges per the owning policy, and records every
 *   lifecycle transition in the document audit trail. Documents under legal
 *   hold are never touched.
 */
import { Types } from 'mongoose';
import { DocumentModel, type DocumentType } from './models/document.model';
import {
  DocumentRetentionPolicyModel,
  type DocumentRetentionPolicy,
} from './models/document-retention-policy.model';

type LeanPolicy = DocumentRetentionPolicy & { _id: Types.ObjectId };
import { recordDocumentAudit } from './document-audit.service';
import { deleteFile } from './storage.service';
import logger from '@api/utils/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function resolvePolicyForDocument(
  clinicId: string,
  documentType: DocumentType
): Promise<LeanPolicy | null> {
  const policies = (await DocumentRetentionPolicyModel.find({
    clinicId: new Types.ObjectId(clinicId),
    isActive: true,
  }).lean()) as unknown as LeanPolicy[];

  // Prefer a policy that names the type explicitly over a catch-all.
  return (
    policies.find((p) => p.documentTypes.includes(documentType)) ??
    policies.find((p) => p.documentTypes.length === 0) ??
    null
  );
}

export async function assignRetention(params: {
  documentId: string;
  clinicId: string;
  documentType: DocumentType;
  uploadedAt?: Date;
  explicitRetentionDays?: number;
  actorId?: string;
}): Promise<{ retainUntil?: Date; expiresAt?: Date; policyId?: string }> {
  const base = params.uploadedAt ?? new Date();
  let retentionDays = params.explicitRetentionDays;
  let policyId: Types.ObjectId | undefined;

  if (retentionDays == null) {
    const policy = await resolvePolicyForDocument(params.clinicId, params.documentType);
    if (policy) {
      retentionDays = policy.retentionDays;
      policyId = policy._id as Types.ObjectId;
    }
  }

  if (retentionDays == null) return {};

  const retainUntil = new Date(base.getTime() + retentionDays * DAY_MS);
  const expiresAt = retainUntil;

  await DocumentModel.updateOne(
    { _id: new Types.ObjectId(params.documentId) },
    { $set: { retentionPolicyId: policyId, retainUntil, expiresAt } }
  );

  await recordDocumentAudit({
    documentId: params.documentId,
    clinicId: params.clinicId,
    actorId: params.actorId,
    action: 'retention_assigned',
    metadata: { retentionDays, policyId: policyId ? String(policyId) : null, expiresAt },
  });

  return { retainUntil, expiresAt, policyId: policyId ? String(policyId) : undefined };
}

export interface SweepResult {
  expired: number;
  archived: number;
  purged: number;
}

export async function runRetentionSweep(now: Date = new Date()): Promise<SweepResult> {
  const result: SweepResult = { expired: 0, archived: 0, purged: 0 };

  // 1. Expire anything past expiresAt that is still active.
  const dueForExpiry = await DocumentModel.find({
    status: 'active',
    expiresAt: { $lte: now },
  })
    .select('_id clinicId retentionPolicyId')
    .lean();

  for (const doc of dueForExpiry) {
    const policy = doc.retentionPolicyId
      ? await DocumentRetentionPolicyModel.findById(doc.retentionPolicyId).lean()
      : null;
    if (policy?.legalHold) continue;

    const nextStatus = policy?.action === 'archive' ? 'archived' : 'expired';
    await DocumentModel.updateOne({ _id: doc._id }, { $set: { status: nextStatus } });
    await recordDocumentAudit({
      documentId: String(doc._id),
      clinicId: String(doc.clinicId),
      action: nextStatus === 'archived' ? 'archived' : 'expired',
      metadata: { policyId: policy ? String(policy._id) : null },
    });
    if (nextStatus === 'archived') result.archived += 1;
    else result.expired += 1;
  }

  // 2. Purge bytes for expired docs whose policy says 'purge' and whose grace
  //    period has elapsed.
  const purgeCandidates = await DocumentModel.find({
    status: { $in: ['expired', 'archived'] },
    retentionPolicyId: { $exists: true },
    deletedAt: { $exists: false },
  })
    .select('_id clinicId storageKey previewStorageKey retentionPolicyId expiresAt')
    .lean();

  for (const doc of purgeCandidates) {
    const policy = await DocumentRetentionPolicyModel.findById(doc.retentionPolicyId).lean();
    if (!policy || policy.action !== 'purge' || policy.legalHold) continue;

    const graceEnds = new Date(
      (doc.expiresAt ? new Date(doc.expiresAt).getTime() : now.getTime()) +
        policy.purgeAfterDays * DAY_MS
    );
    if (graceEnds > now) continue;

    try {
      await deleteFile(doc.storageKey);
      if (doc.previewStorageKey) await deleteFile(doc.previewStorageKey);
    } catch (err) {
      logger.warn({ err, documentId: String(doc._id) }, 'retention purge: storage delete failed');
    }

    await DocumentModel.updateOne(
      { _id: doc._id },
      {
        $set: { status: 'deleted', deletedAt: now },
        $unset: { ocrText: '', previewStorageKey: '' },
      }
    );
    await recordDocumentAudit({
      documentId: String(doc._id),
      clinicId: String(doc.clinicId),
      action: 'purged',
      metadata: { policyId: String(policy._id) },
    });
    result.purged += 1;
  }

  if (result.expired || result.archived || result.purged) {
    logger.info({ ...result }, 'document retention sweep completed');
  }
  return result;
}

// ── Periodic job ───────────────────────────────────────────────────────────

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
let timer: NodeJS.Timeout | null = null;

export function startRetentionSweepJob(): void {
  if (timer) return;
  runRetentionSweep().catch((err) => logger.error({ err }, 'initial retention sweep failed'));
  timer = setInterval(() => {
    runRetentionSweep().catch((err) => logger.error({ err }, 'retention sweep failed'));
  }, SWEEP_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  logger.info('document retention sweep job started');
}

export function stopRetentionSweepJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
