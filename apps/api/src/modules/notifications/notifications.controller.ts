import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { NotificationModel } from './notification.model';

const router = Router();
router.use(authenticate);

const pageQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const idParamSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id') });

// GET /notifications — paginated list for current user
router.get(
  '/',
  validateRequest({ query: pageQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const userId = req.user!.userId;
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      NotificationModel.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      NotificationModel.countDocuments({ userId }),
    ]);

    return res.json({
      status: 'success',
      data: notifications,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }),
);

// GET /notifications/unread-count
router.get(
  '/unread-count',
  asyncHandler(async (req: Request, res: Response) => {
    const count = await NotificationModel.countDocuments({ userId: req.user!.userId, isRead: false });
    return res.json({ status: 'success', data: { count } });
  }),
);

// PUT /notifications/read-all — mark all as read
router.put(
  '/read-all',
  asyncHandler(async (req: Request, res: Response) => {
    await NotificationModel.updateMany(
      { userId: req.user!.userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );
    return res.json({ status: 'success', message: 'All notifications marked as read' });
  }),
);

// PUT /notifications/:id/read — mark single as read
router.put(
  '/:id/read',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const notification = await NotificationModel.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.userId },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true },
    );
    if (!notification) return res.status(404).json({ error: 'NotFound', message: 'Notification not found' });
    return res.json({ status: 'success', data: notification });
  }),
);

// DELETE /notifications/:id
router.delete(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const notification = await NotificationModel.findOneAndDelete({
      _id: req.params.id,
      userId: req.user!.userId,
    });
    if (!notification) return res.status(404).json({ error: 'NotFound', message: 'Notification not found' });
    return res.json({ status: 'success', message: 'Notification deleted' });
  }),
);

export const notificationRoutes = router;
