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
 * @swagger
 * /webhooks/stellar:
 *   post:
 *     summary: Receive payment notifications from the stellar-service stream (internal, unauthenticated)
 *     description: Matches by memo to a pending PaymentRecord and confirms it. Called by the internal stellar-service, not by third-party integrators.
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [memo, txHash]
 *             properties:
 *               memo: { type: string }
 *               txHash: { type: string }
 *               amount: { type: string }
 *               from: { type: string }
 *     responses:
 *       200:
 *         description: Payment processed, or ignored if no matching pending payment was found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     intentId: { type: string }
 *                     txHash: { type: string }
 *       400:
 *         description: Missing memo or txHash
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
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

/**
 * @swagger
 * /webhooks/stellar-payment:
 *   post:
 *     summary: Receive a signed inbound payment webhook (internal, HMAC-verified)
 *     description: Requires an X-Webhook-Signature header matching HMAC-SHA256(webhook.secret, rawBody). Matches the registered webhook by destination (clinic Stellar public key), then updates the matching pending PaymentRecord.
 *     tags: [Webhooks]
 *     parameters:
 *       - in: header
 *         name: X-Webhook-Signature
 *         required: true
 *         schema: { type: string }
 *         description: Hex HMAC-SHA256 digest of the raw request body, signed with the webhook's secret
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [transactionHash, amount, destination, status]
 *             properties:
 *               transactionHash: { type: string }
 *               amount: { type: string }
 *               destination: { type: string, description: "Clinic's Stellar public key, used to look up the webhook" }
 *               memo: { type: string }
 *               status: { type: string, enum: [confirmed, failed] }
 *     responses:
 *       200:
 *         description: Payment status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     intentId: { type: string }
 *                     status: { type: string }
 *       401:
 *         description: Missing or invalid X-Webhook-Signature
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: No matching webhook or payment record found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @swagger
 * /webhooks:
 *   post:
 *     summary: Register a new webhook subscription for the caller's clinic
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url, events]
 *             properties:
 *               url: { type: string, format: uri, example: 'https://your-service.com/webhook' }
 *               events:
 *                 type: array
 *                 items: { type: string }
 *                 example: [payment.confirmed, appointment.created]
 *                 description: 'See the full event list at GET /webhooks/events'
 *               description: { type: string, maxLength: 255 }
 *               retryConfig:
 *                 type: object
 *                 properties:
 *                   maxRetries: { type: integer, minimum: 1, maximum: 10, default: 3 }
 *                   backoffType: { type: string, enum: [exponential, linear, fixed], default: exponential }
 *                   initialDelayMs: { type: integer, minimum: 100, maximum: 60000, default: 1000 }
 *     responses:
 *       201:
 *         description: Webhook registered — the signing secret is returned once and never shown again
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: '507f1f77bcf86cd799439040' }
 *                     url: { type: string }
 *                     events: { type: array, items: { type: string } }
 *                     description: { type: string, nullable: true }
 *                     retryConfig: { type: object }
 *                     secret: { type: string, description: 'HMAC signing secret — store securely, shown only once' }
 *                     createdAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error (e.g. disallowed webhook URL)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Caller lacks CLINIC_ADMIN or SUPER_ADMIN role
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @swagger
 * /webhooks:
 *   get:
 *     summary: List webhook subscriptions for the caller's clinic
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of webhooks (secrets excluded)
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
 *                       id: { type: string }
 *                       url: { type: string }
 *                       events: { type: array, items: { type: string } }
 *                       isActive: { type: boolean }
 *                       description: { type: string, nullable: true }
 *                       retryConfig: { type: object }
 *                       createdAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @swagger
 * /webhooks/events:
 *   get:
 *     summary: List all webhook event types available for subscription
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of event type strings, e.g. patient.created, payment.confirmed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data: { type: array, items: { type: string }, example: [patient.created, payment.confirmed, appointment.created] }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @swagger
 * /webhooks/{id}:
 *   get:
 *     summary: Get a single webhook subscription
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Webhook details (secret excluded)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     url: { type: string }
 *                     events: { type: array, items: { type: string } }
 *                     isActive: { type: boolean }
 *                     description: { type: string, nullable: true }
 *                     retryConfig: { type: object }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       404:
 *         description: Webhook not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @swagger
 * /webhooks/{id}:
 *   patch:
 *     summary: Update a webhook's URL, events, active state, description, or retry config
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url: { type: string, format: uri }
 *               events: { type: array, items: { type: string } }
 *               isActive: { type: boolean }
 *               description: { type: string, maxLength: 255 }
 *               retryConfig:
 *                 type: object
 *                 properties:
 *                   maxRetries: { type: integer, minimum: 1, maximum: 10 }
 *                   backoffType: { type: string, enum: [exponential, linear, fixed] }
 *                   initialDelayMs: { type: integer, minimum: 100, maximum: 60000 }
 *     responses:
 *       200:
 *         description: Webhook updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     url: { type: string }
 *                     events: { type: array, items: { type: string } }
 *                     isActive: { type: boolean }
 *                     description: { type: string, nullable: true }
 *                     retryConfig: { type: object }
 *                     updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Webhook not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @swagger
 * /webhooks/{id}:
 *   delete:
 *     summary: Delete a webhook and its delivery/event history
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Webhook deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     deleted: { type: boolean, example: true }
 *       404:
 *         description: Webhook not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @swagger
 * /webhooks/{id}/deliveries:
 *   get:
 *     summary: Get the delivery log for a webhook (last 50 attempts, newest first)
 *     description: See the "Webhook Delivery & Retries" section of the API documentation for status lifecycle and backoff behavior.
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of delivery attempts
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
 *                       id: { type: string }
 *                       event: { type: string }
 *                       status: { type: string, enum: [pending, delivered, failed, dead] }
 *                       attempts: { type: integer }
 *                       lastAttemptAt: { type: string, format: date-time, nullable: true }
 *                       nextRetryAt: { type: string, format: date-time, nullable: true }
 *                       responseStatus: { type: integer, nullable: true }
 *                       error: { type: string, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *       404:
 *         description: Webhook not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @swagger
 * /webhooks/{id}/deliveries/{deliveryId}:
 *   get:
 *     summary: Get full detail for a single webhook delivery attempt
 *     description: Includes the request/response bodies and headers — intended for debugging failed deliveries.
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: deliveryId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Delivery detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     event: { type: string }
 *                     url: { type: string }
 *                     status: { type: string, enum: [pending, delivered, failed, dead] }
 *                     attempts: { type: integer }
 *                     isTest: { type: boolean }
 *                     lastAttemptAt: { type: string, format: date-time, nullable: true }
 *                     nextRetryAt: { type: string, format: date-time, nullable: true }
 *                     responseStatus: { type: integer, nullable: true }
 *                     durationMs: { type: integer, nullable: true }
 *                     error: { type: string, nullable: true }
 *                     requestHeaders: { type: object, nullable: true }
 *                     requestBody: { type: object, nullable: true }
 *                     responseBody: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *       404:
 *         description: Webhook or delivery not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @swagger
 * /webhooks/{id}/test:
 *   post:
 *     summary: Send a synthetic test webhook event
 *     description: Queues a webhook.test event delivery to the configured URL, using the same delivery pipeline as real events — useful for verifying an endpoint before relying on it.
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       202:
 *         description: Test event queued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 message: { type: string, example: 'Test event queued for delivery' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     deliveryId: { type: string }
 *                     status: { type: string }
 *                     event: { type: string, example: webhook.test }
 *       404:
 *         description: Webhook not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @swagger
 * /webhooks/{id}/deliveries/{deliveryId}/retry:
 *   post:
 *     summary: Manually retry a webhook delivery that is not already delivered
 *     description: Resets attempts to 0 and status to pending, then immediately attempts delivery via the same retry logic used by the background worker.
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: deliveryId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Retry attempted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     deliveryId: { type: string }
 *                     result: { type: string, enum: [delivered, pending_retry] }
 *       400:
 *         description: Delivery already succeeded
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Webhook or delivery not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @swagger
 * /webhooks/{id}/events:
 *   get:
 *     summary: Get the paginated dispatch event log for a webhook
 *     description: One entry per event dispatched to this webhook, with its terminal delivery status. Distinct from /deliveries, which tracks individual attempt-level retries.
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *     responses:
 *       200:
 *         description: Paginated event log
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     events:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           event: { type: string }
 *                           status: { type: string, enum: [dispatched, delivered, failed, dead] }
 *                           deliveredAt: { type: string, format: date-time, nullable: true }
 *                           error: { type: string, nullable: true }
 *                           createdAt: { type: string, format: date-time }
 *                     pagination: { $ref: '#/components/schemas/PaginationMeta' }
 *       404:
 *         description: Webhook not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @swagger
 * /webhooks/stats/overview:
 *   get:
 *     summary: Get aggregate webhook and delivery statistics for the caller's clinic
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Webhook and delivery counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalWebhooks: { type: integer }
 *                     activeWebhooks: { type: integer }
 *                     deliveries:
 *                       type: object
 *                       properties:
 *                         delivered: { type: integer }
 *                         pending: { type: integer }
 *                         failed: { type: integer }
 *                         dead: { type: integer }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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
