import { Router } from 'express';
import { scheduleRoutes } from './schedules.controller';

const router = Router();

router.use('/', scheduleRoutes);

export default router;
