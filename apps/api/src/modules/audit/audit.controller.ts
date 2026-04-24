import { Request, Response, Router } from 'express';
import { AuditLogModel } from './audit.model';
import { authenticate } from '../../middlewares/auth.middleware';
import logger from '../../utils/logger';

const router = Router();

/**
 * @swagger
 * /audit-logs:
 *   get:
 *     summary: Retrieve audit logs (SUPER_ADMIN only)
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of records per page
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs from this date (ISO 8601)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs until this date (ISO 8601)
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     logs:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page: { type: integer }
 *                         limit: { type: integer }
 *                         total: { type: integer }
 *                         totalPages: { type: integer }
 *       403:
 *         description: Forbidden - SUPER_ADMIN role required
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  // Check SUPER_ADMIN role
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'SUPER_ADMIN role required to access audit logs',
    });
  }

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const skip = (page - 1) * limit;

  // Build filter
  const filter: any = {};

  if (req.query.startDate || req.query.endDate) {
    filter.timestamp = {};
    if (req.query.startDate) {
      filter.timestamp.$gte = new Date(req.query.startDate as string);
    }
    if (req.query.endDate) {
      filter.timestamp.$lte = new Date(req.query.endDate as string);
    }
  }

  if (req.query.action) {
    filter.action = req.query.action;
  }

  if (req.query.userId) {
    filter.userId = req.query.userId;
  }

  try {
    const [logs, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'fullName email')
        .populate('clinicId', 'name')
        .lean(),
      AuditLogModel.countDocuments(filter),
    ]);

    return res.json({
      status: 'success',
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching audit logs');
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to retrieve audit logs',
    });
  }
});

export const auditRoutes = router;
