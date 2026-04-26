import { Router } from 'express';
import { paymentRoutes } from './payments.controller';
import { disputeRoutes } from './dispute.controller';
import { paymentExportRoutes } from './payments.export.controller';

const router = Router();

router.use('/', paymentExportRoutes);
router.use('/', paymentRoutes);
router.use('/', disputeRoutes);

export default router;
