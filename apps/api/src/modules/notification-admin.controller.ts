import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Notification, NotificationAdminAudit } from '../models';
import { findScoped } from '../utils/scoped-query';
import { logger } from '../utils/logger';

/**
 * Notification admin controller.
 *
 * Security note (#1771): all record lookups by URL parameter MUST go through
 * `findScoped` so that the query is filtered by the caller's `clinicId`.
 * Direct `Model.findById(req.params.id)` calls are forbidden by the
 * `no-restricted-syntax` ESLint rule and will fail CI.
 */

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    clinicId: string;
    role?: string;
  };
}

/**
 * Log a cross-tenant / not-found access attempt for audit purposes.
 * We deliberately do not distinguish "does not exist" from "belongs to
 * another clinic" in the response, but we do record the attempt.
 */
async function auditNotFound(
  req: AuthenticatedRequest,
  resource: string,
  resourceId: string,
  reason: 'not_found' | 'cross_tenant',
): Promise<void> {
  try {
    await NotificationAdminAudit.create({
      action: `${resource}.read_denied`,
      resource,
      resourceId,
      reason,
      actorId: req.user?.id ?? null,
      actorClinicId: req.user?.clinicId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      timestamp: new Date(),
    });
  } catch (err) {
    // Auditing must never break the request path; log and continue.
    logger.error('Failed to write notification admin audit entry', {
      error: (err as Error).message,
      resource,
      resourceId,
    });
  }
}

/**
 * GET /admin/notifications/:id
 * Fetch a single notification, scoped to the caller's clinic.
 */
export async function getNotificationById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    // Scoped lookup: filters by clinicId from the authenticated user.
    const notification = await findScoped(Notification, id, req.user);

    if (!notification) {
      // Could be missing OR belong to another clinic. Either way: 404 + audit.
      await auditNotFound(req, 'notification', id, 'not_found');
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.status(200).json({ data: notification });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /admin/notifications/:id
 * Update a single notification, scoped to the caller's clinic.
 *
 * Previously this used `findByIdAndUpdate(req.params.id, ...)`, which wrote
 * before any ownership check could run. We now load the scoped record first,
 * verify ownership, and only then mutate.
 */
export async function updateNotificationById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    // Load with clinic scoping BEFORE any write.
    const notification = await findScoped(Notification, id, req.user);

    if (!notification) {
      await auditNotFound(req, 'notification', id, 'not_found');
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    // Apply only whitelisted, mutable fields.
    const allowedFields = ['read', 'archived', 'title', 'body'] as const;
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        (notification as unknown as Record<string, unknown>)[field] = req.body[field];
      }
    }

    await notification.save();

    res.status(200).json({ data: notification });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /admin/notifications/:id
 * Delete a single notification, scoped to the caller's clinic.
 */
export async function deleteNotificationById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    const notification = await findScoped(Notification, id, req.user);

    if (!notification) {
      await auditNotFound(req, 'notification', id, 'not_found');
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    await notification.deleteOne();

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}