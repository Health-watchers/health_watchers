import { Request, Response, Router } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { PaymentDisputeModel } from './models/payment-dispute.model';
import { PaymentRecordModel } from './models/payment-record.model';
import { auditLog } from '../audit/audit.service';
import { sendDisputeOpenedEmail, sendDisputeResolvedEmail } from '@api/lib/email.service';
import { stellarClient } from './services/stellar-client';
import { randomUUID } from 'crypto';

const router = Router();
router.use(authenticate);

const ADMIN_ROLES = requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN');
const REFUND_WINDOW_DAYS = 30;

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
    sendDisputeOpenedEmail(`clinic-${clinicId}@healthwatchers.com`, String(dispute._id), intentId, reason);

    return res.status(201).json({ status: 'success', data: dispute });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

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

// PUT /api/v1/payments/disputes/:id/resolve — Resolve dispute
router.put('/disputes/:id/resolve', ADMIN_ROLES, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resolutionNotes } = req.body;
    const userId = req.user!.userId;
    const clinicId = req.user!.clinicId;

    const validStatuses = ['resolved_refund', 'resolved_no_action', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const dispute = await PaymentDisputeModel.findOne({ _id: id, clinicId });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    if (dispute.status === 'closed') return res.status(400).json({ error: 'Dispute is already closed' });

    dispute.status = status;
    dispute.resolvedBy = userId;
    dispute.resolvedAt = new Date();
    dispute.resolutionNotes = resolutionNotes;
    await dispute.save();

    await auditLog({ action: 'DISPUTE_RESOLVED', userId, clinicId, resourceType: 'PaymentDispute', resourceId: id, metadata: { status } }, req);
    sendDisputeResolvedEmail(`clinic-${clinicId}@healthwatchers.com`, id, status, resolutionNotes);

    return res.json({ status: 'success', data: dispute });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

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

    const payment = await PaymentRecordModel.findOne({ intentId: dispute.paymentIntentId }).lean();
    if (!payment) return res.status(404).json({ error: 'Original payment not found' });

    const paymentDate = (payment as any).createdAt as Date;
    const daysSince = (Date.now() - new Date(paymentDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > REFUND_WINDOW_DAYS) {
      return res.status(400).json({ error: `Refund window expired. Refunds must be issued within ${REFUND_WINDOW_DAYS} days of original payment.` });
    }

    const originalAmount = parseFloat(payment.amount);
    const refundAmount = parseFloat(amount);
    if (isNaN(refundAmount) || refundAmount <= 0 || refundAmount > originalAmount) {
      return res.status(400).json({ error: `Refund amount must be between 0 and ${originalAmount}` });
    }

    const memo = `refund-${dispute.paymentIntentId.slice(0, 16)}`;
    const { transactionHash } = await stellarClient.issueRefund(destinationPublicKey, refundAmount.toString(), memo);

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

    dispute.refundIntentId = refundIntentId;
    dispute.status = 'resolved_refund';
    dispute.resolvedBy = userId;
    dispute.resolvedAt = new Date();
    await dispute.save();

    await auditLog({ action: 'REFUND_ISSUED', userId, clinicId, resourceType: 'PaymentDispute', resourceId: id, metadata: { refundIntentId, amount: refundAmount, transactionHash } }, req);
    sendDisputeResolvedEmail(`clinic-${clinicId}@healthwatchers.com`, id, 'resolved_refund');

    return res.json({ status: 'success', data: { dispute, transactionHash, refundIntentId } });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export const disputeRoutes = router;
