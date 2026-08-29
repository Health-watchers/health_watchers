import { Request, Response, Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { validateRequest } from '../../middlewares/validate.middleware';
import { asyncHandler, sendSuccess, sendError } from '@health-watchers/utils';
import { PaymentRecordModel } from './models/payment-record.model';
import { createPaymentIntent } from './payments.service';
import {
  createPaymentIntentSchema,
  paymentIntentIdParamsSchema,
  CreatePaymentIntentDto,
  PaymentIntentIdParamsDto,
} from './payments.validation';

const router = Router();

// POST /api/v1/payments/intent
router.post(
  '/intent',
  authenticate,
  validateRequest({ body: createPaymentIntentSchema }),
  asyncHandler(async (req: Request<Record<string, never>, unknown, CreatePaymentIntentDto>, res: Response) => {
    const clinicId = req.user?.clinicId;
    if (!clinicId) return sendError(res, 401, 'Unauthorized', 'Missing clinic context');

    const intent = await createPaymentIntent(clinicId, req.body.amount);
    return sendSuccess(res, intent);
  })
);

// GET /api/v1/payments/status/:intentId
router.get(
  '/status/:intentId',
  authenticate,
  validateRequest({ params: paymentIntentIdParamsSchema }),
  asyncHandler(async (req: Request<PaymentIntentIdParamsDto>, res: Response) => {
    const record = await PaymentRecordModel.findOne({
      intentId: req.params.intentId,
      clinicId: req.user?.clinicId,
    }).lean();

    if (!record) return sendError(res, 404, 'NotFound', 'Payment intent not found');
    return sendSuccess(res, { intentId: record.intentId, paymentStatus: record.status });
  })
);

export const paymentRoutes = router;
