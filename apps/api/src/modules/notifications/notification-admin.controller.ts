import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { authenticate } from '@api/middlewares/auth.middleware';
import { authorize } from '@api/middlewares/rbac.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { auditLog } from '../audit/audit.service';
import { paginate } from '@api/utils/paginate';
import { NotificationTemplateModel } from './notification-template.model';
import { NotificationDeliveryModel } from './notification-delivery.model';
import { upsertTemplate } from './notification-template.service';
import { dispatchNotification } from './notification-dispatch.service';
import { getPreferences, updatePreferences } from './notification-preference.service';
import {
  upsertTemplateBodySchema,
  listTemplatesQuerySchema,
  templateIdParamSchema,
  updatePreferencesBodySchema,
  dispatchBodySchema,
  deliveryQuerySchema,
  notificationIdParamSchema,
} from './notification.validation';

const router = Router();
router.use(authenticate);

const ADMIN_ROLES = ['SUPER_ADMIN', 'CLINIC_ADMIN', 'ADMIN'] as const;

/**
 * Multi-channel notification administration (#1250).
 *
 *   GET/PUT  /notifications/preferences              current user's preferences
 *   GET      /notifications/deliveries               current user's delivery log
 *   GET      /notifications/:id/deliveries           deliveries for one notification
 *   GET/POST /notifications/templates                template catalogue (admin)
 *   PUT/DEL  /notifications/templates/:id            manage a template (admin)
 *   POST     /notifications/dispatch                 send a multi-channel notification (admin)
 */

// ── Preferences (any authenticated user) ────────────────────────────────────
router.get(
  '/preferences',
  asyncHandler(async (req: Request, res: Response) => {
    const prefs = await getPreferences(req.user!.userId, req.user!.clinicId);
    return res.json({ status: 'success', data: prefs });
  })
);

router.put(
  '/preferences',
  validateRequest({ body: updatePreferencesBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const prefs = await updatePreferences(req.user!.userId, req.user!.clinicId, req.body);
    return res.json({ status: 'success', data: prefs });
  })
);

// ── Delivery status tracking ────────────────────────────────────────────────
router.get(
  '/deliveries',
  validateRequest({ query: deliveryQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, status, channel } = req.query as unknown as {
      page: number;
      limit: number;
      status?: string;
      channel?: string;
    };
    const filter: Record<string, unknown> = { userId: req.user!.userId };
    if (status) filter.status = status;
    if (channel) filter.channel = channel;
    const result = await paginate(NotificationDeliveryModel, filter, page, limit, {
      createdAt: -1,
    });
    return res.json({ status: 'success', data: result.data, pagination: result.meta });
  })
);

router.get(
  '/:id/deliveries',
  validateRequest({ params: notificationIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const deliveries = await NotificationDeliveryModel.find({
      notificationId: req.params.id,
      userId: req.user!.userId,
    })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ status: 'success', data: deliveries });
  })
);

// ── Templates (admin only) ─────────────────────────────────────────────────
router.get(
  '/templates',
  authorize([...ADMIN_ROLES]),
  validateRequest({ query: listTemplatesQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { key, channel, includeGlobal } = req.query as unknown as {
      key?: string;
      channel?: string;
      includeGlobal: boolean;
    };
    const clinicScopes: Array<Types.ObjectId | null> = [new Types.ObjectId(req.user!.clinicId)];
    if (includeGlobal) clinicScopes.push(null);
    const filter: Record<string, unknown> = { clinicId: { $in: clinicScopes } };
    if (key) filter.key = key;
    if (channel) filter.channel = channel;
    const templates = await NotificationTemplateModel.find(filter).sort({ key: 1 }).lean();
    return res.json({ status: 'success', data: templates });
  })
);

router.post(
  '/templates',
  authorize([...ADMIN_ROLES]),
  validateRequest({ body: upsertTemplateBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const isGlobal = req.body.global === true && req.user!.role === 'SUPER_ADMIN';
    const template = await upsertTemplate({
      ...req.body,
      clinicId: isGlobal ? null : req.user!.clinicId,
      createdBy: req.user!.userId,
    });
    await auditLog({
      userId: req.user!.userId,
      clinicId: req.user!.clinicId,
      action: 'NOTIFICATION_TEMPLATE_UPDATE',
      resourceType: 'NotificationTemplate',
      resourceId: String(template._id),
      outcome: 'SUCCESS',
      metadata: { key: template.key, channel: template.channel, version: template.version },
    });
    return res.status(201).json({ status: 'success', data: template });
  })
);

router.put(
  '/templates/:id',
  authorize([...ADMIN_ROLES]),
  validateRequest({ params: templateIdParamSchema, body: upsertTemplateBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await NotificationTemplateModel.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'NotFound', message: 'Template not found' });
    }
    if (existing.clinicId && String(existing.clinicId) !== req.user!.clinicId) {
      return res
        .status(403)
        .json({ error: 'Forbidden', message: 'Template belongs to another clinic' });
    }
    const template = await upsertTemplate({
      key: existing.key,
      channel: existing.channel,
      locale: req.body.locale ?? existing.locale,
      subject: req.body.subject,
      body: req.body.body,
      description: req.body.description,
      isActive: req.body.isActive,
      clinicId: existing.clinicId,
      createdBy: req.user!.userId,
    });
    await auditLog({
      userId: req.user!.userId,
      clinicId: req.user!.clinicId,
      action: 'NOTIFICATION_TEMPLATE_UPDATE',
      resourceType: 'NotificationTemplate',
      resourceId: String(template._id),
      outcome: 'SUCCESS',
      metadata: { key: template.key, channel: template.channel, version: template.version },
    });
    return res.json({ status: 'success', data: template });
  })
);

router.delete(
  '/templates/:id',
  authorize([...ADMIN_ROLES]),
  validateRequest({ params: templateIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await NotificationTemplateModel.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'NotFound', message: 'Template not found' });
    }
    if (existing.clinicId && String(existing.clinicId) !== req.user!.clinicId) {
      return res
        .status(403)
        .json({ error: 'Forbidden', message: 'Template belongs to another clinic' });
    }
    await existing.deleteOne();
    return res.json({ status: 'success', message: 'Template deleted' });
  })
);

// ── Manual dispatch (admin only) ───────────────────────────────────────────
router.post(
  '/dispatch',
  authorize([...ADMIN_ROLES]),
  validateRequest({ body: dispatchBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await dispatchNotification({
      ...req.body,
      clinicId: req.user!.clinicId,
    });
    return res.status(202).json({ status: 'success', data: result });
  })
);

export const notificationAdminRoutes = router;
