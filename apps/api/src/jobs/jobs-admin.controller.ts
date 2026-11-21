import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { jobRegistry } from './job-registry';

/**
 * GET /admin/jobs — every scheduled background job with its cron pattern,
 * last run, next run and failure count (#1433). Stats are read from Redis, so
 * the answer is the same whichever replica serves the request.
 *
 * This router is mounted on the internal admin surface only (never on the
 * public `/api/v2` prefix). Access requires a SUPER_ADMIN session that has
 * completed MFA verification (#1799).
 */
export const jobsAdminRouter = Router();

/**
 * Rejects requests whose authenticated session has not completed MFA.
 * Assumes `authenticate` has already populated `req.user`.
 */
function requireMfaVerified(req: Request, res: Response, next: () => void): void {
  const user = (req as Request & { user?: { mfaVerified?: boolean; mfaEnabled?: boolean } }).user;
  if (!user || user.mfaVerified !== true) {
    res.status(403).json({
      success: false,
      error: {
        code: 'MFA_REQUIRED',
        message: 'Multi-factor authentication is required for this operation',
      },
    });
    return;
  }
  next();
}

jobsAdminRouter.get(
  '/admin/jobs',
  authenticate,
  requireRoles('SUPER_ADMIN'),
  requireMfaVerified,
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