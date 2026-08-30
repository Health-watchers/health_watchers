import axios from 'axios';
import logger from '@api/utils/logger';
import { WebhookDeliveryModel, WebhookEventLogModel, type IWebhook } from './webhook.model';
import { generateWebhookSignature } from './webhook.service';
import { buildSignatureHeaders } from './webhook-signature';
import { validateWebhookUrl } from '@api/utils/url-validator';

interface RetryConfig {
  maxRetries: number;
  backoffType: 'exponential' | 'linear' | 'fixed';
  initialDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoffType: 'exponential',
  initialDelayMs: 1000,
};

function calculateBackoff(attempt: number, config: RetryConfig): number {
  switch (config.backoffType) {
    case 'exponential':
      return config.initialDelayMs * Math.pow(2, attempt);
    case 'linear':
      return config.initialDelayMs * (attempt + 1);
    case 'fixed':
    default:
      return config.initialDelayMs;
  }
}

export async function retryDelivery(deliveryId: string, webhook: IWebhook): Promise<boolean> {
  const delivery = await WebhookDeliveryModel.findById(deliveryId);
  if (!delivery) {
    logger.warn({ deliveryId }, 'Retry skipped: delivery not found');
    return false;
  }

  if (delivery.status === 'delivered') {
    logger.debug({ deliveryId }, 'Retry skipped: already delivered');
    return true;
  }

  const config: RetryConfig = webhook.retryConfig ?? DEFAULT_RETRY_CONFIG;

  if (delivery.attempts >= config.maxRetries && delivery.status === 'failed') {
    delivery.status = 'dead';
    await delivery.save();

    await WebhookEventLogModel.findOneAndUpdate(
      { deliveryId: delivery._id },
      { status: 'dead', error: `Exceeded max retries (${config.maxRetries})` }
    );

    logger.warn(
      { deliveryId, webhookId: String(webhook._id), attempts: delivery.attempts },
      'Delivery moved to dead letter queue'
    );
    return false;
  }

  const { valid, reason } = validateWebhookUrl(delivery.url);
  if (!valid) {
    delivery.status = 'dead';
    delivery.error = `Blocked URL: ${reason}`;
    await delivery.save();
    logger.error({ deliveryId, reason }, 'Delivery blocked: invalid URL');
    return false;
  }

  const payloadString = JSON.stringify(delivery.payload);
  const signed = buildSignatureHeaders(webhook.secret, payloadString);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'HealthWatchers-Webhooks/1',
    'X-Webhook-Signature': generateWebhookSignature(webhook.secret, payloadString), // legacy
    'X-Webhook-Timestamp': signed['x-webhook-timestamp'],
    'X-Webhook-Signature-256': signed['x-webhook-signature'],
    'X-Webhook-Id': String(delivery._id),
    'X-Webhook-Event': delivery.event,
    'X-Webhook-Attempt': String(delivery.attempts + 1),
  };
  const startedAt = Date.now();

  try {
    const response = await axios.post(delivery.url, delivery.payload, {
      headers,
      timeout: 10000,
    });

    delivery.status = 'delivered';
    delivery.attempts += 1;
    delivery.lastAttemptAt = new Date();
    delivery.responseStatus = response.status;
    delivery.durationMs = Date.now() - startedAt;
    delivery.requestHeaders = headers;
    delivery.error = undefined;
    await delivery.save();

    await WebhookEventLogModel.findOneAndUpdate(
      { deliveryId: delivery._id },
      { status: 'delivered', deliveredAt: new Date() }
    );

    logger.info(
      { deliveryId, webhookId: String(webhook._id), event: delivery.event },
      'Retry delivery succeeded'
    );
    return true;
  } catch (error) {
    delivery.attempts += 1;
    delivery.lastAttemptAt = new Date();
    delivery.durationMs = Date.now() - startedAt;
    delivery.requestHeaders = headers;
    delivery.error = error instanceof Error ? error.message : 'Unknown error';
    const resp = (error as any)?.response;
    if (resp) {
      delivery.responseStatus = resp.status;
      delivery.responseBody =
        typeof resp.data === 'string'
          ? resp.data.slice(0, 2000)
          : JSON.stringify(resp.data ?? '').slice(0, 2000);
    }

    if (delivery.attempts >= config.maxRetries) {
      delivery.status = 'dead';
      await delivery.save();

      await WebhookEventLogModel.findOneAndUpdate(
        { deliveryId: delivery._id },
        { status: 'dead', error: delivery.error }
      );

      logger.error(
        { deliveryId, webhookId: String(webhook._id), error: delivery.error },
        'Delivery permanently failed after max retries'
      );
    } else {
      const backoffMs = calculateBackoff(delivery.attempts - 1, config);
      delivery.nextRetryAt = new Date(Date.now() + backoffMs);
      delivery.status = 'pending';
      await delivery.save();

      logger.warn(
        { deliveryId, attempt: delivery.attempts, nextRetry: delivery.nextRetryAt },
        'Delivery failed, scheduled for retry'
      );
    }
    return false;
  }
}

let retryTimer: ReturnType<typeof setInterval> | null = null;

export function startRetryWorker(intervalMs = 30000): void {
  if (retryTimer) {
    logger.warn('Retry worker already running');
    return;
  }

  retryTimer = setInterval(async () => {
    try {
      const dueDeliveries = await WebhookDeliveryModel.find({
        status: 'pending',
        nextRetryAt: { $lte: new Date() },
      }).limit(50);

      if (dueDeliveries.length === 0) return;

      logger.info({ count: dueDeliveries.length }, 'Processing pending webhook retries');

      for (const delivery of dueDeliveries) {
        const webhook = await import('./webhook.model').then((m) =>
          m.WebhookModel.findById(delivery.webhookId)
        );
        if (!webhook) {
          delivery.status = 'dead';
          delivery.error = 'Webhook not found';
          await delivery.save();
          continue;
        }

        retryDelivery(String(delivery._id), webhook).catch((err) => {
          logger.error({ deliveryId: String(delivery._id), error: err }, 'Retry worker error');
        });
      }
    } catch (error) {
      logger.error({ error }, 'Retry worker tick failed');
    }
  }, intervalMs);

  logger.info({ intervalMs }, 'Webhook retry worker started');
}

export function stopRetryWorker(): void {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
    logger.info('Webhook retry worker stopped');
  }
}
