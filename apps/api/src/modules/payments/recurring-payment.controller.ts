import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { validateRequest } from '../../middlewares/validate.middleware';
import {
  createRecurringPayment,
  getRecurringPayments,
  pauseRecurringPayment,
  resumeRecurringPayment,
  cancelRecurringPayment,
  updateRecurringPayment,
} from './recurring-payment.service';
import {
  createRecurringPaymentSchema,
  updateRecurringPaymentSchema,
} from './recurring-payment.validation';
import logger from '../../utils/logger';

const router = Router();

// POST /api/v1/payments/recurring
router.post(
  '/',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  validateRequest({ body: createRecurringPaymentSchema }),
  async (req: Request, res: Response) => {
    try {
      const payment = await createRecurringPayment(req.user!.clinicId, req.body);
      return res.status(201).json({ success: true, data: payment });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Create recurring payment error');
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// GET /api/v1/payments/recurring
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.query;
    const payments = await getRecurringPayments(
      req.user!.clinicId,
      patientId as string | undefined
    );
    return res.json({ success: true, data: payments });
  } catch (error: unknown) {
    logger.error({ err: error }, 'Get recurring payments error');
    return res.status(500).json({ error: 'InternalServerError' });
  }
});

// PUT /api/v1/payments/recurring/:id/pause
router.put(
  '/:id/pause',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const payment = await pauseRecurringPayment(req.params.id);
      return res.json({ success: true, data: payment });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Pause recurring payment error');
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// PUT /api/v1/payments/recurring/:id/resume
router.put(
  '/:id/resume',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const payment = await resumeRecurringPayment(req.params.id);
      return res.json({ success: true, data: payment });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Resume recurring payment error');
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// DELETE /api/v1/payments/recurring/:id
router.delete(
  '/:id',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const payment = await cancelRecurringPayment(req.params.id);
      return res.json({ success: true, data: payment });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Cancel recurring payment error');
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// PUT /api/v1/payments/recurring/:id
router.put(
  '/:id',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  validateRequest({ body: updateRecurringPaymentSchema }),
  async (req: Request, res: Response) => {
    try {
      const payment = await updateRecurringPayment(req.params.id, req.body);
      return res.json({ success: true, data: payment });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Update recurring payment error');
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

export default router;
