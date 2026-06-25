import { ReimbursementModel } from '../models/reimbursement.model';
import logger from '../../../utils/logger';
import crypto from 'crypto';

const CLAIM_ID_REGEX = /^[a-zA-Z0-9_-]{1,100}$/;
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

export async function processReimbursementWebhook(payload: {
  claimId: string;
  clinicId: string;
  insuranceProvider: string;
  approvedAmount: string;
  currency: 'XLM' | 'USDC';
  insuranceStellarAddress: string;
}): Promise<void> {
  if (!CLAIM_ID_REGEX.test(payload.claimId)) {
    throw new Error('Invalid claimId format');
  }
  if (!OBJECT_ID_REGEX.test(payload.clinicId)) {
    throw new Error('Invalid clinicId format');
  }
  try {
    const reimbursement = await ReimbursementModel.findOneAndUpdate(
      { claimId: payload.claimId },
      {
        ...payload,
        reimbursementStatus: 'processing',
      },
      { upsert: true, new: true }
    );

    logger.info(`[Reimbursement] Processing claim ${payload.claimId} for ${payload.approvedAmount} ${payload.currency}`);
  } catch (err) {
    logger.error('[Reimbursement] Error processing webhook:', err);
    throw err;
  }
}

export async function matchPaymentToReimbursement(
  clinicId: string,
  memo: string,
  txHash: string,
  amount: string
): Promise<void> {
  try {
    // Extract claimId from memo (format: "CLAIM-{claimId}")
    const claimIdMatch = memo.match(/CLAIM-(.+)/);
    if (!claimIdMatch) {
      logger.warn(`[Reimbursement] Could not extract claimId from memo: ${memo}`);
      return;
    }

   const claimId = claimIdMatch[1];
    if (!CLAIM_ID_REGEX.test(claimId)) {
      logger.warn(`[Reimbursement] Invalid claimId format extracted from memo: ${claimId}`);
      return;
    }
    const reimbursement = await ReimbursementModel.findOneAndUpdate(
      { claimId, clinicId },
      {
        reimbursementStatus: 'completed',
        txHash,
        reimbursedAt: new Date(),
      },
      { new: true }
    );

    if (reimbursement) {
      logger.info(`[Reimbursement] Matched payment ${txHash} to claim ${claimId}`);
    } else {
      logger.warn(`[Reimbursement] No reimbursement found for claim ${claimId}`);
    }
  } catch (err) {
    logger.error('[Reimbursement] Error matching payment:', err);
  }
}

export async function getOutstandingReimbursements(clinicId: string): Promise<any[]> {
  return ReimbursementModel.find({
    clinicId,
    reimbursementStatus: { $in: ['pending', 'processing'] },
  }).sort({ createdAt: -1 });
}

export async function getOverdueReimbursements(clinicId: string, daysOverdue: number = 30): Promise<any[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOverdue);

  return ReimbursementModel.find({
    clinicId,
    reimbursementStatus: { $in: ['pending', 'processing'] },
    createdAt: { $lt: cutoffDate },
  }).sort({ createdAt: 1 });
}

export function generateWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = generateWebhookSignature(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}
