import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { NotificationModel } from './notification.model';

const router = Router();
router.use(authenticate);

const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const idParamSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id') });

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: List paginated notifications for the current user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Paginated notification list, newest first
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string, example: '507f1f77bcf86cd799439060' }
 *                       userId: { type: string }
 *                       clinicId: { type: string }
 *                       type:
 *                         type: string
 *                         enum:
 *                           - referral_received
 *                           - payment_confirmed
 *                           - appointment_reminder
 *                           - appointment_status_update
 *                           - ai_summary_ready
 *                           - lab_result_ready
 *                           - high_risk_patient
 *                           - system
 *                           - balance_low_warning
 *                           - balance_critical
 *                           - large_transaction
 *                           - unrecognized_transaction
 *                           - waitlist_available
 *                           - claimable_expiring
 *                           - subscription_warning
 *                           - follow_up_reminder
 *                       title: { type: string, example: 'Lab result ready' }
 *                       message: { type: string, example: 'New lab results are available for review.' }
 *                       link: { type: string, nullable: true, example: '/patients/507f1f77bcf86cd799439011/lab-results' }
 *                       isRead: { type: boolean, example: false }
 *                       readAt: { type: string, format: date-time, nullable: true }
 *                       metadata: { type: object, nullable: true }
 *                       expiresAt: { type: string, format: date-time, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *                       updatedAt: { type: string, format: date-time }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     total: { type: integer, example: 42 }
 *                     totalPages: { type: integer, example: 3 }
 *                     hasNext: { type: boolean, example: true }
 *                     hasPrev: { type: boolean, example: false }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  })
);

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Get the count of unread notifications for the current user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread notification count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     count: { type: integer, example: 4 }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get(
  '/unread-count',
  asyncHandler(async (req: Request, res: Response) => {
    const count = await NotificationModel.countDocuments({
      userId: req.user!.userId,
      isRead: false,
    });
    return res.json({ status: 'success', data: { count } });
  })
);

/**
 * @swagger
 * /notifications/read-all:
 *   put:
 *     summary: Mark all of the current user's unread notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 message: { type: string, example: 'All notifications marked as read' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.put(
  '/read-all',
  asyncHandler(async (req: Request, res: Response) => {
    await NotificationModel.updateMany(
      { userId: req.user!.userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    return res.json({ status: 'success', message: 'All notifications marked as read' });
  })
);

/**
 * @swagger
 * /notifications/{id}/read:
 *   put:
 *     summary: Mark a single notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Notification MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     userId: { type: string }
 *                     clinicId: { type: string }
 *                     type: { type: string, example: lab_result_ready }
 *                     title: { type: string }
 *                     message: { type: string }
 *                     link: { type: string, nullable: true }
 *                     isRead: { type: boolean, example: true }
 *                     readAt: { type: string, format: date-time }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Invalid notification id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Notification not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.put(
  '/:id/read',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const notification = await NotificationModel.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.userId },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    );
    if (!notification)
      return res.status(404).json({ error: 'NotFound', message: 'Notification not found' });
    return res.json({ status: 'success', data: notification });
  })
);

/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Notification MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Notification deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 message: { type: string, example: 'Notification deleted' }
 *       400:
 *         description: Invalid notification id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Notification not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.delete(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const notification = await NotificationModel.findOneAndDelete({
      _id: req.params.id,
      userId: req.user!.userId,
    });
    if (!notification)
      return res.status(404).json({ error: 'NotFound', message: 'Notification not found' });
    return res.json({ status: 'success', message: 'Notification deleted' });
  })
);

export const notificationRoutes = router;
