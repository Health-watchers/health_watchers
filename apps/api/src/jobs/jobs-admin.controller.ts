import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { jobRegistry } from './job-registry';

/**
 * GET /admin/jobs — every scheduled background job with its cron pattern,
 * last run, next run and failure count (#1433). Stats are read from Redis, so
 * the answer is the same whichever replica serves the request.
 */
export const jobsAdminRouter = Router();

jobsAdminRouter.get(
  '/admin/jobs',
  authenticate,
  requireRoles('SUPER_ADMIN'),
  asyncHandler(async (_req: Request, res: Response) => {
    const jobs = await jobRegistry.list();
    res.json({
      success: true,
      data: {
        schedulerRunning: jobRegistry.isRunning(),
        jobs,
      },
    });
  })
);
