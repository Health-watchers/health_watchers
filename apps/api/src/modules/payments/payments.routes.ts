import { Router } from 'express';
import { paymentRoutes } from './payments.controller';
import { disputeRoutes } from './dispute.controller';
import { paymentExportRoutes } from './payments.export.controller';
import { claimsRoutes } from './claims.controller';
import { batchPaymentRouter } from './batch-payment.controller';
import { analyticsRoutes } from './analytics.controller';

const router = Router();

router.use('/', analyticsRoutes);
router.use('/', paymentExportRoutes);
router.use('/', paymentRoutes);
router.use('/', disputeRoutes);
router.use('/claims', claimsRoutes);
router.use('/batch', batchPaymentRouter);

export default router;
