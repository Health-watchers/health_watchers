import { Router } from 'express';
import { paymentRoutes } from './payments.controller';
import { disputeRoutes } from './dispute.controller';
import { paymentExportRoutes } from './payments.export.controller';
import { claimsRoutes } from './claims.controller';
import { batchPaymentRouter } from './batch-payment.controller';
import { exchangeRateRoutes } from './exchange-rate.controller';
import recurringPaymentRouter from './recurring-payment.controller';
import { analyticsRoutes } from './analytics.controller';
import { paymentsBalanceRouter } from './payments-balance.router';
import { paymentsFundRouter } from './payments-fund.router';

const router = Router();

// Split routers for improved organization (Issue #1514)
router.use('/', paymentsBalanceRouter);
router.use('/', paymentsFundRouter);

router.use('/', exchangeRateRoutes);
router.use('/', paymentExportRoutes);
router.use('/', paymentRoutes);
router.use('/', disputeRoutes);
router.use('/claims', claimsRoutes);
router.use('/batch', batchPaymentRouter);
router.use('/recurring', recurringPaymentRouter);
router.use('/', analyticsRoutes);

export default router;
