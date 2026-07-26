import crypto from 'crypto';
import axios from 'axios';
import logger from '@api/utils/logger';
import { validateWebhookUrl } from '@api/utils/url-validator';
import { WebhookModel, WebhookDeliveryModel } from './webhook.model';

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
): Promise<void> {
  // Enqueue delivery as background job (non-blocking)
  setImmediate(() => {
    deliverWebhookWithRetry(webhookId, event, url, secret, payload).catch((error) => {
      logger.error({ webhookId, event, url, error }, 'Unhandled error in webhook delivery');
    });
  });
}

async function deliverWebhookWithRetry(
  webhookId: string,
  event: string,
  url: string,
  secret: string,
  payload: Record<string, any>
): Promise<void> {
  const payloadString = JSON.stringify(payload);
  const signature = generateWebhookSignature(secret, payloadString);

  let delivery = await WebhookDeliveryModel.findOne({
    webhookId,
    event,
    url,
    status: { $in: ['pending', 'failed'] },
  });

  if (!delivery) {
    delivery = await WebhookDeliveryModel.create({
      webhookId,
      event,
      url,
      payload,
      status: 'pending',
      attempts: 0,
    });
  }

  const maxAttempts = 3;
  const backoffMs = [1000, 5000, 30000]; // 1s, 5s, 30s

  const { valid, reason } = validateWebhookUrl(url);
  if (!valid) {
    delivery.status = 'failed';
    delivery.error = `Blocked URL: ${reason}`;
    await delivery.save();
    logger.error({ webhookId, event, url, reason }, 'Webhook delivery blocked: invalid URL');
    return;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await axios.post(url, payload, {
        headers: {
          'X-Webhook-Signature': signature,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      delivery.status = 'delivered';
      delivery.attempts = attempt + 1;
      delivery.lastAttemptAt = new Date();
      await delivery.save();

      logger.info({ webhookId, event, url }, 'Webhook delivered successfully');
      return;
    } catch (error) {
      delivery.attempts = attempt + 1;
      delivery.lastAttemptAt = new Date();
      delivery.error = error instanceof Error ? error.message : 'Unknown error';

      if (attempt < maxAttempts - 1) {
        // Apply backoff delay before retry
        await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
        delivery.nextRetryAt = new Date(Date.now() + backoffMs[attempt]);
        delivery.status = 'pending';
      } else {
        delivery.status = 'failed';
      }

      await delivery.save();

      if (attempt < maxAttempts - 1) {
        logger.warn(
          { webhookId, event, url, attempt: attempt + 1, nextRetry: delivery.nextRetryAt },
          'Webhook delivery failed, will retry'
        );
      } else {
        logger.error(
          { webhookId, event, url, error },
          'Webhook delivery failed after max attempts'
        );
      }
    }
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
  for (const wh of webhooks) {
    enqueueWebhookDelivery(String(wh._id), event, wh.url, wh.secret, { event, data }).catch(
      (err) => {
        logger.error({ webhookId: String(wh._id), event, err }, 'Failed to enqueue webhook event');
      }
    );
  }
}
