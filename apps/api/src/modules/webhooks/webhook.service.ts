import crypto from 'crypto';
import axios from 'axios';
import logger from '@api/utils/logger';
import { validateWebhookUrl } from '@api/utils/url-validator';
import { WebhookModel, WebhookDeliveryModel, WebhookEventLogModel } from './webhook.model';
import type { IWebhookDelivery } from './webhook.model';

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateWebhookSignature(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyWebhookSignature(
  secret: string,
  payload: string,
  signature: string
): boolean {
  const expected = generateWebhookSignature(secret, payload);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function enqueueWebhookDelivery(
  webhookId: string,
  event: string,
  url: string,
  secret: string,
  payload: Record<string, any>
): Promise<IWebhookDelivery> {
  const payloadString = JSON.stringify(payload);
  const signature = generateWebhookSignature(secret, payloadString);

  const { valid, reason } = validateWebhookUrl(url);
  if (!valid) {
    const delivery = await WebhookDeliveryModel.create({
      webhookId,
      event,
      url,
      payload,
      status: 'dead',
      attempts: 0,
      error: `Blocked URL: ${reason}`,
    });
    logger.error({ webhookId, event, url, reason }, 'Webhook delivery blocked: invalid URL');
    return delivery;
  }

  const delivery = await WebhookDeliveryModel.create({
    webhookId,
    event,
    url,
    payload,
    status: 'pending',
    attempts: 0,
  });

  setImmediate(() => {
    executeDelivery(delivery, signature).catch((error) => {
      logger.error({ webhookId, event, url, error }, 'Unhandled error in webhook delivery');
    });
  });

  return delivery;
}

async function executeDelivery(delivery: IWebhookDelivery, signature: string): Promise<void> {
  const webhook = await WebhookModel.findById(delivery.webhookId);
  const maxAttempts = webhook?.retryConfig?.maxRetries ?? 3;
  const initialDelay = webhook?.retryConfig?.initialDelayMs ?? 1000;
  const backoffType = webhook?.retryConfig?.backoffType ?? 'exponential';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.post(delivery.url, delivery.payload, {
        headers: {
          'X-Webhook-Signature': signature,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      delivery.status = 'delivered';
      delivery.attempts = attempt + 1;
      delivery.lastAttemptAt = new Date();
      delivery.responseStatus = response.status;
      delivery.error = undefined;
      await delivery.save();

      await WebhookEventLogModel.findOneAndUpdate(
        { deliveryId: delivery._id },
        { status: 'delivered', deliveredAt: new Date() }
      );

      logger.info(
        { deliveryId: String(delivery._id), webhookId: delivery.webhookId, event: delivery.event },
        'Webhook delivered successfully'
      );
      return;
    } catch (error) {
      delivery.attempts = attempt + 1;
      delivery.lastAttemptAt = new Date();
      delivery.error = error instanceof Error ? error.message : 'Unknown error';

      if (attempt < maxAttempts - 1) {
        const delayMs = calculateBackoff(attempt, initialDelay, backoffType);
        delivery.nextRetryAt = new Date(Date.now() + delayMs);
        delivery.status = 'pending';
      } else {
        delivery.status = 'dead';
      }

      await delivery.save();

      if (attempt < maxAttempts - 1) {
        logger.warn(
          {
            deliveryId: String(delivery._id),
            attempt: attempt + 1,
            nextRetry: delivery.nextRetryAt,
          },
          'Webhook delivery failed, will retry'
        );
      } else {
        await WebhookEventLogModel.findOneAndUpdate(
          { deliveryId: delivery._id },
          { status: 'dead', error: delivery.error }
        );
        logger.error(
          { deliveryId: String(delivery._id), event: delivery.event, error: delivery.error },
          'Webhook delivery failed permanently'
        );
      }
    }
  }
}

function calculateBackoff(attempt: number, initialDelay: number, type: string): number {
  switch (type) {
    case 'exponential':
      return initialDelay * Math.pow(2, attempt);
    case 'linear':
      return initialDelay * (attempt + 1);
    case 'fixed':
    default:
      return initialDelay;
  }
}

// Legacy export for backward compatibility
export const deliverWebhook = enqueueWebhookDelivery;

/**
 * Dispatch an event to all active webhooks registered for a clinic.
 * Each delivery is enqueued non-blocking with automatic retries.
 */
export async function dispatchWebhookEvent(
  clinicId: string,
  event: string,
  data: Record<string, any>
): Promise<void> {
  const webhooks = await WebhookModel.find({ clinicId, events: event, isActive: true });

  if (webhooks.length === 0) return;

  const eventPayload = {
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  for (const wh of webhooks) {
    const delivery = await enqueueWebhookDelivery(
      String(wh._id),
      event,
      wh.url,
      wh.secret,
      eventPayload
    ).catch((err) => {
      logger.error({ webhookId: String(wh._id), event, err }, 'Failed to enqueue webhook event');
      return null;
    });

    if (delivery) {
      await WebhookEventLogModel.create({
        clinicId,
        webhookId: wh._id,
        event,
        payload: eventPayload,
        status: 'dispatched',
        deliveryId: delivery._id,
      }).catch((err) => {
        logger.error({ event, err }, 'Failed to create event log');
      });
    }
  }
}
