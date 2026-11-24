import { Types } from 'mongoose';
import logger from '@api/utils/logger';
import {
  InsuranceClaimModel,
  type ClaimRemittance,
  type ClaimStatus,
  type ClearinghouseProvider,
  type IInsuranceClaim,
} from './claim.model';
import { canTransition, encounterBillingStatusFor } from './claim-status';
import { EncounterModel } from '../encounters/encounter.model';
import {
  getClearinghouse,
  resolveProvider,
  type ClaimFrequencyCode,
  type ClearinghouseClaimStatus,
  type RemittanceRecord,
} from './clearinghouse';

type ClaimLike = Pick<
  IInsuranceClaim,
  'encounterId' | 'patientId' | 'clinicId' | 'totalAmount' | 'edi837Data' | 'status'
> & {
  _id: unknown;
  clearinghouse?: IInsuranceClaim['clearinghouse'];
};

const toObjectId = (v?: string) => (v && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : undefined);

export function statusEvent(status: ClaimStatus, userId?: string, note?: string) {
  const by = toObjectId(userId);
  return { status, at: new Date(), ...(by ? { by } : {}), ...(note ? { note } : {}) };
}

async function syncEncounter(encounterId: unknown, status: ClaimStatus) {
  if (!encounterId) return;
  await EncounterModel.updateOne(
    { _id: encounterId },
    { $set: { 'billing.billingStatus': encounterBillingStatusFor(status) } }
  ).catch(() => undefined);
}

export interface TransmitResult {
  claimId: string;
  transmitted: boolean;
  rejected?: boolean;
  submissionId?: string;
  reason?: string;
}

/**
 * Sends a claim's 837P to the configured clearinghouse and records the outcome. A front-end
 * rejection moves the claim to `rejected`; transport failures leave it `submitted` so a later
 * sync can retry.
 */
export async function transmitClaim(
  claim: ClaimLike,
  frequencyCode: ClaimFrequencyCode,
  userId?: string,
  provider: ClearinghouseProvider = resolveProvider()
): Promise<TransmitResult> {
  const claimId = String(claim._id);
  try {
    const adapter = getClearinghouse(provider);
    const result = await adapter.submitClaim({
      claimId,
      clinicId: String(claim.clinicId),
      edi837: claim.edi837Data ?? '',
      totalAmount: claim.totalAmount,
      frequencyCode,
      originalPayerClaimId: claim.clearinghouse?.payerClaimId,
    });

    const clearinghouse = {
      provider: adapter.provider,
      submissionId: result.submissionId,
      payerClaimId: claim.clearinghouse?.payerClaimId,
      lastStatus: result.accepted ? 'received' : 'rejected',
      lastCheckedAt: new Date(),
    };

    if (result.accepted) {
      await InsuranceClaimModel.updateOne({ _id: claim._id }, { $set: { clearinghouse } });
      return { claimId, transmitted: true, submissionId: result.submissionId };
    }

    await InsuranceClaimModel.updateOne(
      { _id: claim._id },
      {
        $set: { clearinghouse, status: 'rejected', rejectionReason: result.rejectionReason },
        $push: { statusHistory: statusEvent('rejected', userId, result.rejectionReason) },
      }
    );
    await syncEncounter(claim.encounterId, 'rejected');
    return {
      claimId,
      transmitted: true,
      rejected: true,
      submissionId: result.submissionId,
      reason: result.rejectionReason,
    };
  } catch (err) {
    logger.warn({ err, claimId }, 'Clearinghouse transmission failed; claim left as submitted');
    return { claimId, transmitted: false, reason: (err as Error).message };
  }
}

/** Maps a clearinghouse status onto the claim lifecycle, or null if nothing changes. */
export function nextStatusFromClearinghouse(
  current: ClaimStatus,
  reported: ClearinghouseClaimStatus
): ClaimStatus | null {
  if (reported === 'pending' || reported === current) return null;
  return canTransition(current, reported) ? reported : null;
}

/**
 * Posts an ERA (835) remittance to a claim: appends it, accumulates the paid amount and moves
 * the claim to `paid` (payment > 0) or `denied` (zero payment with denial adjustments).
 */
export async function postRemittance(
  claim: IInsuranceClaim,
  era: Omit<ClaimRemittance, '_id' | 'postedAt'>,
  userId?: string
): Promise<IInsuranceClaim> {
  if (claim.remittances?.some((r) => r.eraId === era.eraId)) return claim; // idempotent

  claim.remittances = [...(claim.remittances ?? []), { ...era, postedAt: new Date() }];
  claim.paidAmount = Math.round(((claim.paidAmount ?? 0) + era.paidAmount) * 100) / 100;

  const target: ClaimStatus = era.paidAmount > 0 ? 'paid' : 'denied';
  if (claim.status !== target && canTransition(claim.status, target)) {
    const carc = era.adjustments
      .filter((a) => a.groupCode !== 'PR')
      .map((a) => `${a.groupCode}-${a.reasonCode}`)
      .join(', ');
    const note =
      target === 'paid'
        ? `ERA ${era.eraId}: paid ${era.paidAmount.toFixed(2)}`
        : `ERA ${era.eraId}: denied${carc ? ` (${carc})` : ''}`;
    claim.status = target;
    if (target === 'paid') claim.paidAt = new Date();
    if (target === 'denied') {
      claim.denialReason = note;
      claim.rejectionReason = note;
    }
    claim.statusHistory.push(statusEvent(target, userId, note));
    await syncEncounter(claim.encounterId, target);
  }

  await claim.save();
  return claim;
}

export interface SyncResult {
  claimId: string;
  previousStatus: ClaimStatus;
  status: ClaimStatus;
  remittancesPosted: number;
}

/** Polls the clearinghouse for one claim and applies status changes and new ERAs. */
export async function syncClaim(claim: IInsuranceClaim, userId?: string): Promise<SyncResult> {
  const previousStatus = claim.status;
  const submissionId = claim.clearinghouse?.submissionId;
  if (!submissionId || !claim.clearinghouse?.provider) {
    return { claimId: String(claim._id), previousStatus, status: claim.status, remittancesPosted: 0 };
  }
  const adapter = getClearinghouse(claim.clearinghouse.provider);

  const status = await adapter.getClaimStatus(submissionId);
  if (status.payerClaimId) claim.set('clearinghouse.payerClaimId', status.payerClaimId);
  claim.set('clearinghouse.lastStatus', status.status);
  claim.set('clearinghouse.lastCheckedAt', status.checkedAt);

  const next = nextStatusFromClearinghouse(claim.status, status.status);
  // paid/denied are applied from the ERA itself so amounts are recorded alongside the status
  if (next && next !== 'paid' && next !== 'denied') {
    claim.status = next;
    if (next === 'accepted') claim.acceptedAt = status.checkedAt;
    if (next === 'rejected') claim.rejectionReason = status.message;
    claim.statusHistory.push(statusEvent(next, userId, status.message ?? `Clearinghouse: ${status.status}`));
    await syncEncounter(claim.encounterId, next);
  }

  let posted = 0;
  if (status.status === 'paid' || status.status === 'denied') {
    const eras: RemittanceRecord[] = await adapter.fetchRemittances([submissionId]);
    for (const { submissionId: _ignored, ...era } of eras) {
      const before = claim.remittances?.length ?? 0;
      await postRemittance(claim, era, userId);
      posted += (claim.remittances?.length ?? 0) - before;
    }
  }
  if (!posted) await claim.save();

  return { claimId: String(claim._id), previousStatus, status: claim.status, remittancesPosted: posted };
}
