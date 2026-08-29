import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth';
import {
  getArchivedRecords,
  restoreArchivedRecord,
  getArchiveStats,
  triggerArchival,
  deleteExpiredArchives,
} from './archive.controller';

const router = Router();

router.use(protect);

// Get archived records for clinic
router.get('/records', authorize(['CLINIC_ADMIN', 'DOCTOR', 'SUPER_ADMIN']), getArchivedRecords);

// Get archive statistics
router.get('/stats', authorize(['CLINIC_ADMIN', 'SUPER_ADMIN']), getArchiveStats);

// Restore an archived record
router.post('/restore', authorize(['CLINIC_ADMIN', 'SUPER_ADMIN']), restoreArchivedRecord);

// Trigger archival for a collection
router.post('/trigger', authorize(['CLINIC_ADMIN', 'SUPER_ADMIN']), triggerArchival);

// Delete expired archives
router.post('/delete-expired', authorize(['CLINIC_ADMIN', 'SUPER_ADMIN']), deleteExpiredArchives);

export default router;
