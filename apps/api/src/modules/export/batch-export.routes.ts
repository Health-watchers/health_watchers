import { Router } from 'express';
import { batchExportController } from './batch-export.controller';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// POST /exports/batch — enqueue an async export job (#1072)
router.post(
  '/batch',
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  batchExportController.startExport.bind(batchExportController)
);

// GET /exports/stream/:type/:format — streaming download with progress updates (#1072)
router.get(
  '/stream/:type/:format',
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  batchExportController.streamExport.bind(batchExportController)
);

// GET /exports/progress/:jobId — poll job progress (#1072)
router.get('/progress/:jobId', batchExportController.getProgress.bind(batchExportController));

// GET /exports/progress/:jobId/stream — SSE real-time progress (#1072)
router.get(
  '/progress/:jobId/stream',
  batchExportController.streamProgressSSE.bind(batchExportController)
);

export default router;
