import { Router } from 'express';
import { providerSchedulingRoutes } from './provider-scheduling.controller';

const router = Router();
router.use('/', providerSchedulingRoutes);

export default router;
