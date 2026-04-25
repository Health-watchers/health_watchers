import crypto from 'crypto';
import axios from 'axios';
import logger from '@api/utils/logger';
import { WebhookDeliveryModel } from './webhook.model';

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

export async function deliverWebhook(
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
