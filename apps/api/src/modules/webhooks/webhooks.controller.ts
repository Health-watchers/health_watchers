import { Router, Request, Response } from 'express';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { asyncHandler } from '@api/middlewares/async.handler';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import logger from '@api/utils/logger';
import { WebhookModel, WebhookDeliveryModel } from './webhook.model';
import { generateWebhookSecret, verifyWebhookSignature, deliverWebhook } from './webhook.service';
import { registerWebhookSchema, inboundWebhookSchema } from './webhook.validation';

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

    payment.status = 'confirmed';
    payment.txHash = txHash;
    await payment.save();

    logger.info(
      { intentId: payment.intentId, txHash, amount },
      'stellar-webhook: payment confirmed'
    );

    // Trigger outbound webhooks for registered listeners
    const webhooks = await WebhookModel.find({
      clinicId: payment.clinicId,
      events: 'payment.confirmed',
      isActive: true,
    });

    for (const webhook of webhooks) {
      await deliverWebhook(String(webhook._id), 'payment.confirmed', webhook.url, webhook.secret, {
        event: 'payment.confirmed',
        data: {
          intentId: payment.intentId,
          amount: payment.amount,
          destination: payment.destination,
          txHash,
          confirmedAt: new Date(),
        },
      });
    }

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

    // Find matching webhook by destination (clinic's public key)
    const webhook = await WebhookModel.findOne({
      url: { $regex: destination },
    });

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

    // Find and update payment record
    const payment = await PaymentRecordModel.findOne({
      memo,
      status: 'pending',
    });

    if (!payment) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Payment record not found',
      });
    }

    if (status === 'confirmed') {
      payment.status = 'confirmed';
      payment.txHash = transactionHash;
      payment.confirmedAt = new Date();
    } else if (status === 'failed') {
      payment.status = 'failed';
    }

    await payment.save();

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
    const { url, events } = req.body;
    const secret = generateWebhookSecret();

    const webhook = await WebhookModel.create({
      clinicId: req.user!.clinicId,
      url,
      events,
      secret,
      isActive: true,
    });

    return res.status(201).json({
      status: 'success',
      data: {
        id: String(webhook._id),
        url: webhook.url,
        events: webhook.events,
        secret, // Return secret only once
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
        createdAt: w.createdAt,
      })),
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

    // Clean up delivery logs
    await WebhookDeliveryModel.deleteMany({ webhookId: webhook._id });

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
        error: d.error,
        createdAt: d.createdAt,
      })),
    });
  })
);

export const webhookRoutes = router;
