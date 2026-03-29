import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/middlewares/async.handler';
import { AuditLogModel } from './audit-log.model';
import { parsePagination } from '@api/utils/paginate';

const router = Router();
router.use(authenticate);
router.use(requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'));

// GET /audit-logs?page=1&limit=20
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;

    // SUPER_ADMIN can query any clinic; CLINIC_ADMIN is scoped to their own
    const filter: Record<string, unknown> =
      req.user!.role === 'SUPER_ADMIN' && req.query.clinicId
        ? { clinicId: req.query.clinicId }
        : { clinicId: req.user!.clinicId };

    const [logs, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLogModel.countDocuments(filter),
    ]);

    return res.json({ status: 'success', data: logs, meta: { total, page, limit } });
  }),
);

export const auditLogRoutes = router;
