import { Router } from 'express';
import { ResearchController } from './research.controller';
import { authenticate } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/middlewares/async.handler';

const router = Router();

// All research endpoints require authentication and SUPER_ADMIN role
router.use(authenticate);

// Middleware to check SUPER_ADMIN role
const requireSuperAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. SUPER_ADMIN role required.',
    });
  }
  next();
};

router.use(requireSuperAdmin);

/**
 * @route   GET /api/v1/research/export
 * @desc    Export anonymized dataset for research (Level 3 aggregation)
 * @access  SUPER_ADMIN only
 * @query   irbApproval=true (required)
 * @query   includeEncounters=true (optional)
 */
router.get('/export', asyncHandler(ResearchController.exportAnonymizedData));

export default router;
