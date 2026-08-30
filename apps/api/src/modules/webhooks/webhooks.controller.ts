import { Router, Request, Response } from 'express';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { asyncHandler } from '@api/middlewares/async.handler';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import logger from '@api/utils/logger';
import { WebhookModel, WebhookDeliveryModel, WebhookEventLogModel } from './webhook.model';
import {
  generateWebhookSecret,
  verifyWebhookSignature,
  enqueueWebhookDelivery,
  sendTestWebhook,
} from './webhook.service';
import {
  registerWebhookSchema,
  updateWebhookSchema,
  inboundWebhookSchema,
} from './webhook.validation';
import { confirmPayment } from '../payments/services/payment-confirmation.service';
import { retryDelivery } from './retry-worker';

const router = Router();

/**
 * POST /webhooks/stellar
 * Receives payment notifications from the stellar-service stream.
 * Matches by memo to a pending PaymentRecord and confirms it.
 */
router.post(
  '/stellar',
  asyncHandler(async (req: Request, res: Response) => {
    const { memo, txHash, amount, from } = req.body as {
      memo?: string;
      txHash?: string;
      amount?: string;
      from?: string;
    };

    if (!memo || !txHash) {
      return res.status(400).json({ error: 'BadRequest', message: 'memo and txHash are required' });
    }

    const payment = await PaymentRecordModel.findOne({ memo, status: 'pending' });

    if (!payment) {
      logger.info({ memo, txHash, from }, 'stellar-webhook: no matching pending payment — ignored');
      return res.json({ status: 'ignored' });
    }

    const result = await confirmPayment({
      intentId: payment.intentId,
      txHash,
      allowAlreadyConfirmed: true,
    });

    logger.info(
      { intentId: payment.intentId, txHash, amount, result: result.status },
      'stellar-webhook: payment processed'
    );

    return res.json({ status: 'success', data: { intentId: payment.intentId, txHash } });
  })
);

// POST /webhooks/stellar-payment (inbound webhook with signature verification)
router.post(
  '/stellar-payment',
  validateRequest({ body: inboundWebhookSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-webhook-signature'] as string;
    if (!signature) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'X-Webhook-Signature header is required',
      });
    }

    const { transactionHash, amount, destination, memo, status } = req.body;
    const payloadString = JSON.stringify(req.body);

    // Find matching webhook by destination (clinic's public key).
    // Exact match — this runs before signature verification, so treating `destination`
    // (unauthenticated request body input) as a regex would allow ReDoS (see PENTEST_FINDINGS FIND-005).
    const webhook = await WebhookModel.findOne({ url: destination });

    if (!webhook) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Webhook not found',
      });
    }

    // Verify signature
    if (!verifyWebhookSignature(webhook.secret, payloadString, signature)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid webhook signature',
      });
    }

    // Find matching payment record
    const payment = await PaymentRecordModel.findOne({ memo, status: 'pending' });

    if (!payment) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Payment record not found',
      });
    }

    if (status === 'confirmed') {
      await confirmPayment({
        intentId: payment.intentId,
        txHash: transactionHash,
        allowAlreadyConfirmed: true,
      });
    } else if (status === 'failed') {
      payment.status = 'failed';
      await payment.save();
    }

    logger.info(
      { intentId: payment.intentId, transactionHash, status },
      'Inbound webhook: payment status updated'
    );

    return res.json({
      status: 'success',
      data: { intentId: payment.intentId, status },
    });
  })
);

// POST /webhooks (register webhook)
router.post(
  '/',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validateRequest({ body: registerWebhookSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { url, events, description, retryConfig, payloadTemplate, rateLimitPerMin } = req.body;
    const secret = generateWebhookSecret();

    const webhook = await WebhookModel.create({
      clinicId: req.user!.clinicId,
      url,
      events,
      secret,
      description,
      retryConfig,
      payloadTemplate,
      rateLimitPerMin: rateLimitPerMin ?? 0,
      isActive: true,
    });

    return res.status(201).json({
      status: 'success',
      data: {
        id: String(webhook._id),
        url: webhook.url,
        events: webhook.events,
        description: webhook.description,
        retryConfig: webhook.retryConfig,
        payloadTemplate: webhook.payloadTemplate,
        rateLimitPerMin: webhook.rateLimitPerMin,
        secret,
        createdAt: webhook.createdAt,
      },
    });
  })
);

// GET /webhooks (list webhooks)
router.get(
  '/',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const webhooks = await WebhookModel.find({
      clinicId: req.user!.clinicId,
    }).select('-secret');

    return res.json({
      status: 'success',
      data: webhooks.map((w) => ({
        id: String(w._id),
        url: w.url,
        events: w.events,
        isActive: w.isActive,
        description: w.description,
        retryConfig: w.retryConfig,
        createdAt: w.createdAt,
      })),
    });
  })
);

// GET /webhooks/events (list available event types)
router.get(
  '/events',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (_req: Request, res: Response) => {
    const { WEBHOOK_EVENTS } = await import('./webhook.validation');
    return res.json({
      status: 'success',
      data: WEBHOOK_EVENTS,
    });
  })
);

// GET /webhooks/:id (get single webhook)
router.get(
  '/:id',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = await WebhookModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    }).select('-secret');

    if (!webhook) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Webhook not found',
      });
    }

    return res.json({
      status: 'success',
      data: {
        id: String(webhook._id),
        url: webhook.url,
        events: webhook.events,
        isActive: webhook.isActive,
        description: webhook.description,
        retryConfig: webhook.retryConfig,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
      },
    });
  })
);

// PATCH /webhooks/:id (update webhook url, events, or active state)
router.patch(
  '/:id',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validateRequest({ body: updateWebhookSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { url, events, isActive, description, retryConfig, payloadTemplate, rateLimitPerMin } =
      req.body;

    const update: Record<string, unknown> = {};
    const unset: Record<string, unknown> = {};
    if (url !== undefined) update.url = url;
    if (events !== undefined) update.events = events;
    if (isActive !== undefined) update.isActive = isActive;
    if (description !== undefined) update.description = description;
    if (retryConfig !== undefined) update.retryConfig = retryConfig;
    if (rateLimitPerMin !== undefined) update.rateLimitPerMin = rateLimitPerMin;
    if (payloadTemplate === null) unset.payloadTemplate = '';
    else if (payloadTemplate !== undefined) update.payloadTemplate = payloadTemplate;

    const mutation: Record<string, unknown> = { ...update };
    if (Object.keys(unset).length > 0) mutation.$unset = unset;

    const webhook = await WebhookModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId },
      mutation,
      { new: true }
    ).select('-secret');

    if (!webhook) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Webhook not found',
      });
    }

    return res.json({
      status: 'success',
      data: {
        id: String(webhook._id),
        url: webhook.url,
        events: webhook.events,
        isActive: webhook.isActive,
        description: webhook.description,
        retryConfig: webhook.retryConfig,
        payloadTemplate: webhook.payloadTemplate,
        rateLimitPerMin: webhook.rateLimitPerMin,
        updatedAt: webhook.updatedAt,
      },
    });
  })
);

// DELETE /webhooks/:id (delete webhook)
router.delete(
  '/:id',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = await WebhookModel.findOneAndDelete({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });

    if (!webhook) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Webhook not found',
      });
    }

    await WebhookDeliveryModel.deleteMany({ webhookId: webhook._id });
    await WebhookEventLogModel.deleteMany({ webhookId: webhook._id });

    return res.json({
      status: 'success',
      data: { id: req.params.id, deleted: true },
    });
  })
);

// GET /webhooks/:id/deliveries (webhook delivery log)
router.get(
  '/:id/deliveries',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = await WebhookModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });

    if (!webhook) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Webhook not found',
      });
    }

    const deliveries = await WebhookDeliveryModel.find({
      webhookId: webhook._id,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({
      status: 'success',
      data: deliveries.map((d) => ({
        id: String(d._id),
        event: d.event,
        status: d.status,
        attempts: d.attempts,
        lastAttemptAt: d.lastAttemptAt,
        nextRetryAt: d.nextRetryAt,
        responseStatus: d.responseStatus,
        error: d.error,
        createdAt: d.createdAt,
      })),
    });
  })
);

// GET /webhooks/:id/deliveries/:deliveryId (full delivery detail for debugging)
router.get(
  '/:id/deliveries/:deliveryId',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = await WebhookModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });
    if (!webhook) {
      return res.status(404).json({ error: 'NotFound', message: 'Webhook not found' });
    }

    const delivery = await WebhookDeliveryModel.findOne({
      _id: req.params.deliveryId,
      webhookId: webhook._id,
    });
    if (!delivery) {
      return res.status(404).json({ error: 'NotFound', message: 'Delivery not found' });
    }

    return res.json({
      status: 'success',
      data: {
        id: String(delivery._id),
        event: delivery.event,
        url: delivery.url,
        status: delivery.status,
        attempts: delivery.attempts,
        isTest: delivery.isTest ?? false,
        lastAttemptAt: delivery.lastAttemptAt,
        nextRetryAt: delivery.nextRetryAt,
        responseStatus: delivery.responseStatus,
        durationMs: delivery.durationMs,
        error: delivery.error,
        requestHeaders: delivery.requestHeaders ?? null,
        requestBody: delivery.payload,
        responseBody: delivery.responseBody ?? null,
        createdAt: delivery.createdAt,
      },
    });
  })
);

// POST /webhooks/:id/test (send a synthetic webhook.test event)
router.post(
  '/:id/test',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = await WebhookModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });
    if (!webhook) {
      return res.status(404).json({ error: 'NotFound', message: 'Webhook not found' });
    }

    const delivery = await sendTestWebhook({
      _id: webhook._id,
      url: webhook.url,
      secret: webhook.secret,
    });

    return res.status(202).json({
      status: 'success',
      message: 'Test event queued for delivery',
      data: {
        deliveryId: String((delivery as { _id?: unknown })._id),
        status: delivery.status,
        event: 'webhook.test',
      },
    });
  })
);

// POST /webhooks/:id/deliveries/:deliveryId/retry (manually retry a delivery)
router.post(
  '/:id/deliveries/:deliveryId/retry',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = await WebhookModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });

    if (!webhook) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Webhook not found',
      });
    }

    const delivery = await WebhookDeliveryModel.findOne({
      _id: req.params.deliveryId,
      webhookId: webhook._id,
    });

    if (!delivery) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Delivery not found',
      });
    }

    if (delivery.status === 'delivered') {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Delivery already succeeded',
      });
    }

    delivery.status = 'pending';
    delivery.attempts = 0;
    delivery.nextRetryAt = new Date();
    delivery.error = undefined;
    await delivery.save();

    const success = await retryDelivery(String(delivery._id), webhook);

    return res.json({
      status: 'success',
      data: {
        deliveryId: String(delivery._id),
        result: success ? 'delivered' : 'pending_retry',
      },
    });
  })
);

// GET /webhooks/:id/events (event log for a webhook)
router.get(
  '/:id/events',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = await WebhookModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });

    if (!webhook) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Webhook not found',
      });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      WebhookEventLogModel.find({ webhookId: webhook._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      WebhookEventLogModel.countDocuments({ webhookId: webhook._id }),
    ]);

    return res.json({
      status: 'success',
      data: {
        events: events.map((e) => ({
          id: String(e._id),
          event: e.event,
          status: e.status,
          deliveredAt: e.deliveredAt,
          error: e.error,
          createdAt: e.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  })
);

// GET /webhooks/stats/overview (delivery statistics)
router.get(
  '/stats/overview',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = req.user!.clinicId;

    const [totalWebhooks, activeWebhooks, deliveryStats] = await Promise.all([
      WebhookModel.countDocuments({ clinicId }),
      WebhookModel.countDocuments({ clinicId, isActive: true }),
      WebhookDeliveryModel.aggregate([
        {
          $lookup: {
            from: 'webhooks',
            localField: 'webhookId',
            foreignField: '_id',
            as: 'webhook',
          },
        },
        { $unwind: '$webhook' },
        { $match: { 'webhook.clinicId': clinicId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const stats = {
      totalWebhooks,
      activeWebhooks,
      deliveries: {
        delivered: 0,
        pending: 0,
        failed: 0,
        dead: 0,
      },
    };

    for (const stat of deliveryStats) {
      if (stat._id in stats.deliveries) {
        (stats.deliveries as Record<string, number>)[stat._id] = stat.count;
      }
    }

    return res.json({
      status: 'success',
      data: stats,
    });
  })
);

export const webhookRoutes = router;
