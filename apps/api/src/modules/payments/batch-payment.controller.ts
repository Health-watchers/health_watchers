import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest as validate } from '@api/middlewares/validate.middleware';
import { batchPaymentService } from './batch-payment.service';
import { createBatchPaymentSchema } from './batch-payment.validation';

const router = Router();

// POST /api/v1/payments/batch
router.post(
  '/',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ body: createBatchPaymentSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const batch = await batchPaymentService.createBatch(req.body, user);

      return res.status(201).json({
        status: 'success',
        data: batch,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// GET /api/v1/payments/batch/:batchId
router.get(
  '/:batchId',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const batch = await batchPaymentService.getBatch(req.params.batchId, user.clinicId);

      if (!batch) {
        return res.status(404).json({
          status: 'error',
          message: 'Batch not found',
        });
      }

      return res.json({
        status: 'success',
        data: batch,
      });
    } catch (error) {
      return next(error);
    }
  }
);

export const batchPaymentRouter = router;
