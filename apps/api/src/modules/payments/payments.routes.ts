import { Router } from 'express';
import { paymentRoutes } from './payments.controller';
import { disputeRoutes } from './dispute.controller';

const router = Router();

router.use('/', paymentRoutes);
router.use('/', disputeRoutes);

export default router;
