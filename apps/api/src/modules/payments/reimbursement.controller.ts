import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { ReimbursementModel } from './models/reimbursement.model';
import {
  processReimbursementWebhook,
  matchPaymentToReimbursement,
  getOutstandingReimbursements,
  getOverdueReimbursements,
  verifyWebhookSignature,
} from './services/reimbursement.service';
import logger from '../../utils/logger';

const router = Router();

// POST /api/v1/webhooks/insurance-reimbursement - Insurance webhook
router.post('/insurance-reimbursement', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-insurance-signature'] as string;
    const secret = process.env.INSURANCE_WEBHOOK_SECRET;

    if (!signature || !secret) {
      return res
        .status(401)
        .json({ error: 'Unauthorized', message: 'Missing signature or secret' });
    }

    const payload = JSON.stringify(req.body);
    if (!verifyWebhookSignature(payload, signature, secret)) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid signature' });
    }

    const {
      claimId,
      clinicId,
      insuranceProvider,
      approvedAmount,
      currency,
      insuranceStellarAddress,
    } = req.body;

    if (!claimId || !clinicId || !approvedAmount || !currency || !insuranceStellarAddress) {
      return res.status(400).json({ error: 'ValidationError', message: 'Missing required fields' });
    }

    await processReimbursementWebhook({
      claimId,
      clinicId,
      insuranceProvider,
      approvedAmount,
      currency,
      insuranceStellarAddress,
    });

    res.json({ success: true, message: 'Reimbursement processed' });
  } catch (err) {
    logger.error('Error processing reimbursement webhook:', err);
    res.status(500).json({ error: 'InternalServerError' });
  }
});

// GET /api/v1/payments/reimbursements - List reimbursements
router.get(
  '/reimbursements',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
     const { status, overdue } = req.query;
      const ALLOWED_STATUSES = new Set(['pending', 'approved', 'rejected', 'paid', 'cancelled']);
      let query: Record<string, unknown> = { clinicId: req.user!.clinicId };
      if (status) {
        if (!ALLOWED_STATUSES.has(String(status))) {
          return res.status(400).json({ error: 'ValidationError', message: 'Invalid status value' });
        }
        query.reimbursementStatus = String(status);
      }

      let reimbursements = await ReimbursementModel.find(query).sort({ createdAt: -1 });

      if (overdue === 'true') {
        const overdueList = await getOverdueReimbursements(String(req.user!.clinicId));
        reimbursements = overdueList;
      }

      const outstanding = await getOutstandingReimbursements(String(req.user!.clinicId));
      const totalOutstanding = outstanding.reduce(
        (sum, r) => sum + parseFloat(r.approvedAmount),
        0
      );

      res.json({
        reimbursements,
        summary: {
          total: reimbursements.length,
          outstanding: outstanding.length,
          totalOutstandingAmount: totalOutstanding,
        },
      });
    } catch (err) {
      logger.error('Error fetching reimbursements:', err);
      res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// GET /api/v1/payments/reimbursements/:claimId - Get reimbursement details
router.get('/reimbursements/:claimId', authenticate, async (req: Request, res: Response) => {
  try {
    const reimbursement = await ReimbursementModel.findOne({
      claimId: req.params.claimId,
      clinicId: req.user!.clinicId,
    });

    if (!reimbursement) {
      return res.status(404).json({ error: 'NotFound', message: 'Reimbursement not found' });
    }

    res.json(reimbursement);
  } catch (err) {
    logger.error('Error fetching reimbursement:', err);
    res.status(500).json({ error: 'InternalServerError' });
  }
});

export const reimbursementRoutes = router;
