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
router.get('/records', authorize(['admin', 'doctor']), getArchivedRecords);

// Get archive statistics
router.get('/stats', authorize(['admin']), getArchiveStats);

// Restore an archived record
router.post('/restore', authorize(['admin']), restoreArchivedRecord);

// Trigger archival for a collection
router.post('/trigger', authorize(['admin']), triggerArchival);

// Delete expired archives
router.post('/delete-expired', authorize(['admin']), deleteExpiredArchives);

export default router;
