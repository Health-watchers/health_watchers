import { Router } from 'express';
import { batchExportController } from './batch-export.controller';
import { authenticate } from '@api/middlewares/auth.middleware';
import { requireRole } from '@api/middlewares/role.middleware';

const router = Router();

router.use(authenticate);

router.post('/batch', requireRole(['ADMIN', 'SUPER_ADMIN']), batchExportController.startExport.bind(batchExportController));

router.get('/stream/:type/:format', requireRole(['ADMIN', 'SUPER_ADMIN']), batchExportController.streamExport.bind(batchExportController));

router.get('/progress/:jobId', batchExportController.getProgress.bind(batchExportController));

router.get('/progress/:jobId/stream', batchExportController.streamProgressSSE.bind(batchExportController));

export default router;
