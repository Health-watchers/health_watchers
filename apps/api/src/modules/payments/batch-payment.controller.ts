import { Router, Request, Response } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest as validate } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { Errors } from '@api/utils/AppError';
import { batchPaymentService } from './batch-payment.service';
import { createBatchPaymentSchema } from './batch-payment.validation';

const router = Router();

// POST /api/v1/payments/batch
router.post(
  '/',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ body: createBatchPaymentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const batch = await batchPaymentService.createBatch(req.body, user);

    return res.status(201).json({
      status: 'success',
      data: {
        ...batch,
        summary: batchPaymentService.getBatchSummary(batch),
      },
    });
  })
);

// GET /api/v1/payments/batch/:batchId
router.get(
  '/:batchId',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const batch = await batchPaymentService.getBatch(req.params.batchId, user.clinicId);

    if (!batch) {
      throw Errors.payment.notFound(req.params.batchId);
    }

    return res.json({
      status: 'success',
      data: {
        ...batch,
        summary: batchPaymentService.getBatchSummary(batch),
      },
    });
  })
);

// POST /api/v1/payments/batch/:batchId/cancel
router.post(
  '/:batchId/cancel',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const batch = await batchPaymentService.cancelBatch(req.params.batchId, user.clinicId);

    if (!batch) {
      throw Errors.payment.notFound(req.params.batchId);
    }

    return res.json({
      status: 'success',
      data: {
        ...batch,
        summary: batchPaymentService.getBatchSummary(batch),
      },
    });
  })
);

export const batchPaymentRouter = router;
