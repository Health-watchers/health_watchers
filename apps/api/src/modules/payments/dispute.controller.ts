import { Request, Response, Router } from 'express';
import axios from 'axios';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize, Roles } from '../../middlewares/rbac.middleware';
import { PaymentDisputeModel } from './models/payment-dispute.model';
import { PaymentRecordModel } from './models/payment-record.model';
import { config } from '@health-watchers/config';

const router = Router();

const REFUND_WINDOW_DAYS = 30;

// --- Email notification stubs ---
async function notifyDisputeOpened(disputeId: string, clinicId: string) {
  // TODO: integrate email provider (e.g. SendGrid)
  console.log(`[EMAIL] Dispute opened: ${disputeId} for clinic ${clinicId}`);
}

async function notifyDisputeResolved(disputeId: string, status: string) {
  // TODO: integrate email provider
  console.log(`[EMAIL] Dispute ${disputeId} resolved with status: ${status}`);
}

// --- Audit log stub ---
function auditLog(action: string, userId: string, meta: Record<string, unknown>) {
  // TODO: persist to AuditLog collection
  console.log(`[AUDIT] ${action} by ${userId}`, meta);
}

// POST /api/v1/payments/:intentId/dispute — Open dispute
router.post('/:intentId/dispute', authenticate, async (req: Request, res: Response) => {
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

    auditLog('DISPUTE_OPENED', userId, { disputeId: dispute._id, intentId });
    await notifyDisputeOpened(String(dispute._id), clinicId);

    return res.status(201).json({ status: 'success', data: dispute });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/payments/disputes — List disputes (CLINIC_ADMIN+)
router.get('/disputes', authorize([Roles.CLINIC_ADMIN, Roles.SUPER_ADMIN]), async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    const disputes = await PaymentDisputeModel.find({ clinicId }).sort({ openedAt: -1 }).lean();
    return res.json({ status: 'success', data: disputes });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/v1/payments/disputes/:id/resolve — Resolve dispute
router.put('/disputes/:id/resolve', authorize([Roles.CLINIC_ADMIN, Roles.SUPER_ADMIN]), async (req: Request, res: Response) => {
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

    auditLog('DISPUTE_RESOLVED', userId, { disputeId: id, status });
    await notifyDisputeResolved(id, status);

    return res.json({ status: 'success', data: dispute });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/payments/disputes/:id/refund — Issue refund
router.post('/disputes/:id/refund', authorize([Roles.CLINIC_ADMIN, Roles.SUPER_ADMIN]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, destinationPublicKey } = req.body;
    const userId = req.user!.userId;
    const clinicId = req.user!.clinicId;

    const dispute = await PaymentDisputeModel.findOne({ _id: id, clinicId });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    if (dispute.refundIntentId) return res.status(409).json({ error: 'Refund already issued for this dispute' });

    // Validate original payment and 30-day window
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

    // Submit refund transaction via stellar-service
    const stellarResponse = await axios.post(`${config.stellar.serviceUrl}/refund`, {
      fromSecret: config.stellar.secretKey,
      toPublic: destinationPublicKey,
      amount: refundAmount.toString(),
      memo: `refund-${dispute.paymentIntentId.slice(0, 8)}`,
    });

    const { transactionHash, refundIntentId } = stellarResponse.data;

    // Record refund as a new payment record
    const refundRecord = await PaymentRecordModel.create({
      intentId: refundIntentId,
      clinicId,
      amount: refundAmount.toString(),
      destination: destinationPublicKey,
      memo: `refund-${dispute.paymentIntentId.slice(0, 8)}`,
      status: 'confirmed',
    });

    dispute.refundIntentId = refundRecord.intentId;
    dispute.status = 'resolved_refund';
    dispute.resolvedBy = userId;
    dispute.resolvedAt = new Date();
    await dispute.save();

    auditLog('REFUND_ISSUED', userId, { disputeId: id, refundIntentId: refundRecord.intentId, amount, transactionHash });
    await notifyDisputeResolved(id, 'resolved_refund');

    return res.json({ status: 'success', data: { dispute, transactionHash, refundIntentId: refundRecord.intentId } });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export const disputeRoutes = router;
