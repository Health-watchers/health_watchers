import { Request, Response, Router } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { PaymentDisputeModel, IPaymentDispute } from './models/payment-dispute.model';
import { PaymentRecordModel } from './models/payment-record.model';
import { auditLog } from '../audit/audit.service';
import {
  sendDisputeOpenedEmail,
  sendDisputeResolvedEmail,
  sendDisputeEvidenceSubmittedEmail,
} from '@api/lib/email.service';
import { stellarClient } from './services/stellar-client';
import { randomUUID } from 'crypto';

const router = Router();
router.use(authenticate);

const ADMIN_ROLES = requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN');
const REFUND_WINDOW_DAYS = 30;
const REVIEW_PERIOD_DAYS = 7;
const REVIEW_PERIOD_MS = REVIEW_PERIOD_DAYS * 24 * 60 * 60 * 1000;

const clinicEmail = (clinicId: string) => `clinic-${clinicId}@healthwatchers.com`;

/**
 * Issue a Stellar refund for a dispute and record it. Shared by the dedicated
 * refund endpoint and by automatic refund processing on patient-favored resolution.
 * Returns either the refund details or a structured error to surface to the caller.
 */
async function processRefund(
  dispute: IPaymentDispute,
  amount: string,
  destinationPublicKey: string,
  userId: string,
  clinicId: string,
  req: Request,
): Promise<
  | { ok: true; transactionHash: string; refundIntentId: string; refundAmount: number }
  | { ok: false; status: number; error: string }
> {
  const payment = await PaymentRecordModel.findOne({ intentId: dispute.paymentIntentId }).lean();
  if (!payment) return { ok: false, status: 404, error: 'Original payment not found' };

  const paymentDate = (payment as any).createdAt as Date;
  const daysSince = (Date.now() - new Date(paymentDate).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > REFUND_WINDOW_DAYS) {
    return {
      ok: false,
      status: 400,
      error: `Refund window expired. Refunds must be issued within ${REFUND_WINDOW_DAYS} days of original payment.`,
    };
  }

  const originalAmount = parseFloat(payment.amount);
  const refundAmount = parseFloat(amount);
  if (isNaN(refundAmount) || refundAmount <= 0 || refundAmount > originalAmount) {
    return { ok: false, status: 400, error: `Refund amount must be between 0 and ${originalAmount}` };
  }

  const memo = `refund-${dispute.paymentIntentId.slice(0, 16)}`;
  const { transactionHash } = await stellarClient.issueRefund(
    destinationPublicKey,
    refundAmount.toString(),
    memo,
  );

  const refundIntentId = randomUUID();
  await PaymentRecordModel.create({
    intentId: refundIntentId,
    clinicId,
    patientId: dispute.patientId,
    amount: refundAmount.toString(),
    destination: destinationPublicKey,
    memo,
    status: 'confirmed',
    txHash: transactionHash,
    confirmedAt: new Date(),
    assetCode: payment.assetCode || 'XLM',
  });

  await auditLog(
    {
      action: 'REFUND_ISSUED',
      userId,
      clinicId,
      resourceType: 'PaymentDispute',
      resourceId: String(dispute._id),
      metadata: { refundIntentId, amount: refundAmount, transactionHash },
    },
    req,
  );

  return { ok: true, transactionHash, refundIntentId, refundAmount };
}

/**
 * @swagger
 * /payments/{intentId}/dispute:
 *   post:
 *     summary: Open a payment dispute
 *     tags: [Payment Disputes]
 *     security:
 *       - bearerAuth: []
 */
// POST /api/v1/payments/:intentId/dispute — Open dispute
router.post('/:intentId/dispute', async (req: Request, res: Response) => {
  try {
    const { intentId } = req.params;
    const { patientId, reason, description } = req.body;
    const userId = req.user!.userId;
    const clinicId = req.user!.clinicId;

    const payment = await PaymentRecordModel.findOne({ intentId, clinicId }).lean();
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const existing = await PaymentDisputeModel.findOne({ paymentIntentId: intentId }).lean();
    if (existing) return res.status(409).json({ error: 'Dispute already exists for this payment' });

    const dispute = await PaymentDisputeModel.create({
      paymentIntentId: intentId,
      clinicId,
      patientId,
      reason,
      description,
      openedBy: userId,
      openedAt: new Date(),
    });

    await auditLog({ action: 'DISPUTE_OPENED', userId, clinicId, resourceType: 'PaymentDispute', resourceId: String(dispute._id), metadata: { intentId } }, req);
    sendDisputeOpenedEmail(clinicEmail(clinicId), String(dispute._id), intentId, reason);

    return res.status(201).json({ status: 'success', data: dispute });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /payments/disputes:
 *   get:
 *     summary: List disputes for the caller's clinic (CLINIC_ADMIN+)
 *     tags: [Payment Disputes]
 *     security:
 *       - bearerAuth: []
 */
// GET /api/v1/payments/disputes — List disputes (CLINIC_ADMIN+)
router.get('/disputes', ADMIN_ROLES, async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    const disputes = await PaymentDisputeModel.find({ clinicId }).sort({ openedAt: -1 }).lean();
    return res.json({ status: 'success', data: disputes });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /payments/disputes/{disputeId}/evidence:
 *   post:
 *     summary: Submit evidence for a dispute (starts the 7-day review period)
 *     tags: [Payment Disputes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [description]
 *             properties:
 *               description: { type: string }
 *               attachmentUrl: { type: string }
 *     responses:
 *       200: { description: Evidence recorded; review deadline returned }
 *       400: { description: Missing description or dispute already resolved }
 *       404: { description: Dispute not found }
 */
// POST /api/v1/payments/:id/disputes/:disputeId/evidence — Submit evidence
// (also accept the simpler /disputes/:disputeId/evidence form)
async function submitEvidenceHandler(req: Request, res: Response) {
  try {
    const disputeId = req.params.disputeId;
    const { description, attachmentUrl } = req.body as { description?: string; attachmentUrl?: string };
    const userId = req.user!.userId;
    const clinicId = req.user!.clinicId;

    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'evidence description is required' });
    }

    const dispute = await PaymentDisputeModel.findOne({ _id: disputeId, clinicId });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    if (['resolved_refund', 'resolved_no_action', 'closed'].includes(dispute.status)) {
      return res.status(400).json({ error: 'Cannot submit evidence on a resolved or closed dispute' });
    }

    const now = new Date();
    const reviewDeadline = new Date(now.getTime() + REVIEW_PERIOD_MS);

    dispute.evidence.push({ description: description.trim(), attachmentUrl, submittedBy: userId, submittedAt: now });
    // Start the review period on first evidence submission; keep the original deadline thereafter.
    if (!dispute.evidenceSubmittedAt) {
      dispute.evidenceSubmittedAt = now;
      dispute.reviewDeadline = reviewDeadline;
    }
    if (dispute.status === 'open') dispute.status = 'evidence_submitted';
    await dispute.save();

    await auditLog(
      { action: 'DISPUTE_OPENED', userId, clinicId, resourceType: 'PaymentDispute', resourceId: disputeId, metadata: { event: 'evidence_submitted' } },
      req,
    );
    sendDisputeEvidenceSubmittedEmail(clinicEmail(clinicId), disputeId, dispute.reviewDeadline ?? reviewDeadline);

    return res.json({
      status: 'success',
      data: { dispute, reviewDeadline: dispute.reviewDeadline },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

router.post('/:intentId/disputes/:disputeId/evidence', submitEvidenceHandler);
router.post('/disputes/:disputeId/evidence', submitEvidenceHandler);

/**
 * @swagger
 * /payments/disputes/{id}/resolve:
 *   put:
 *     summary: Resolve a dispute. Resolving in the patient's favor with refund details auto-processes a refund.
 *     tags: [Payment Disputes]
 *     security:
 *       - bearerAuth: []
 */
// PUT /api/v1/payments/disputes/:id/resolve — Resolve dispute
router.put('/disputes/:id/resolve', ADMIN_ROLES, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resolutionNotes, outcome, refundAmount, refundDestination } = req.body;
    const userId = req.user!.userId;
    const clinicId = req.user!.clinicId;

    const validStatuses = ['resolved_refund', 'resolved_no_action', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const dispute = await PaymentDisputeModel.findOne({ _id: id, clinicId });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    if (dispute.status === 'closed') return res.status(400).json({ error: 'Dispute is already closed' });

    // Enforce the 7-day review period once evidence has been submitted.
    if (dispute.reviewDeadline && dispute.reviewDeadline > new Date() && req.user!.role !== 'SUPER_ADMIN') {
      const retryAfter = Math.ceil((dispute.reviewDeadline.getTime() - Date.now()) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(425).json({
        error: `Review period is still active. Dispute cannot be resolved until ${dispute.reviewDeadline.toISOString()}.`,
        reviewDeadline: dispute.reviewDeadline,
      });
    }

    // Determine outcome — explicit `outcome` wins, otherwise infer from status.
    const resolvedOutcome =
      outcome ??
      (status === 'resolved_refund' ? 'patient_favored' : status === 'closed' ? 'no_action' : 'clinic_favored');

    let refundResult: { transactionHash: string; refundIntentId: string; refundAmount: number } | undefined;

    // Automatic refund processing when resolved in the patient's favor.
    if (resolvedOutcome === 'patient_favored' || status === 'resolved_refund') {
      if (dispute.refundIntentId) {
        return res.status(409).json({ error: 'Refund already issued for this dispute' });
      }
      if (refundDestination && refundAmount != null) {
        const result = await processRefund(dispute, String(refundAmount), refundDestination, userId, clinicId, req);
        if (!result.ok) return res.status(result.status).json({ error: result.error });
        refundResult = result;
        dispute.refundIntentId = result.refundIntentId;
      }
    }

    dispute.status = status;
    dispute.resolvedBy = userId;
    dispute.resolvedAt = new Date();
    dispute.resolutionNotes = resolutionNotes;
    dispute.resolution = {
      outcome: resolvedOutcome,
      notes: resolutionNotes,
      resolvedBy: userId,
      resolvedAt: new Date(),
      refundIntentId: dispute.refundIntentId,
      refundAmount: refundResult ? String(refundResult.refundAmount) : undefined,
    };
    await dispute.save();

    await auditLog({ action: 'DISPUTE_RESOLVED', userId, clinicId, resourceType: 'PaymentDispute', resourceId: id, metadata: { status, outcome: resolvedOutcome } }, req);
    sendDisputeResolvedEmail(clinicEmail(clinicId), id, status, resolutionNotes);

    return res.json({ status: 'success', data: { dispute, ...(refundResult ? { transactionHash: refundResult.transactionHash, refundIntentId: refundResult.refundIntentId } : {}) } });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /payments/disputes/{id}/refund:
 *   post:
 *     summary: Issue a (full or partial) Stellar refund for a dispute
 *     tags: [Payment Disputes]
 *     security:
 *       - bearerAuth: []
 */
// POST /api/v1/payments/disputes/:id/refund — Issue refund
router.post('/disputes/:id/refund', ADMIN_ROLES, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, destinationPublicKey } = req.body;
    const userId = req.user!.userId;
    const clinicId = req.user!.clinicId;

    const dispute = await PaymentDisputeModel.findOne({ _id: id, clinicId });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    if (dispute.refundIntentId) return res.status(409).json({ error: 'Refund already issued for this dispute' });

    const result = await processRefund(dispute, String(amount), destinationPublicKey, userId, clinicId, req);
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    dispute.refundIntentId = result.refundIntentId;
    dispute.status = 'resolved_refund';
    dispute.resolvedBy = userId;
    dispute.resolvedAt = new Date();
    dispute.resolution = {
      outcome: 'patient_favored',
      resolvedBy: userId,
      resolvedAt: new Date(),
      refundIntentId: result.refundIntentId,
      refundAmount: String(result.refundAmount),
    };
    await dispute.save();

    sendDisputeResolvedEmail(clinicEmail(clinicId), id, 'resolved_refund');

    return res.json({ status: 'success', data: { dispute, transactionHash: result.transactionHash, refundIntentId: result.refundIntentId } });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export const disputeRoutes = router;
