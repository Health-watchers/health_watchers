import crypto from 'crypto';
import axios from 'axios';
import logger from '@api/utils/logger';
import { validateWebhookUrl } from '@api/utils/url-validator';
import { WebhookModel, WebhookDeliveryModel, WebhookEventLogModel } from './webhook.model';
import type { IWebhookDelivery } from './webhook.model';
import { buildSignatureHeaders } from './webhook-signature';
import { applyTemplate, type EventContext } from './webhook-template';
import { consumeWebhookRateLimit } from './webhook-rate-limiter';

/** A persisted delivery — the Mongoose document adds `_id` and `save()`. */
type DeliveryDoc = IWebhookDelivery & { _id: unknown; save: () => Promise<unknown> };

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Legacy bare-hex HMAC of the body — still sent as `X-Webhook-Signature`. */
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

const RESPONSE_BODY_LIMIT = 2000;

function outboundHeaders(
  secret: string,
  bodyString: string,
  delivery: IWebhookDelivery
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'HealthWatchers-Webhooks/1',
    'X-Webhook-Signature': generateWebhookSignature(secret, bodyString), // legacy
    ...buildSignatureHeaders(secret, bodyString), // X-Webhook-Timestamp + X-Webhook-Signature-256
    'X-Webhook-Id': String((delivery as any)._id ?? ''),
    'X-Webhook-Event': delivery.event,
    'X-Webhook-Attempt': String((delivery.attempts ?? 0) + 1),
  };
}

/**
 * Re-key the header map so `buildSignatureHeaders` (which uses the lower-case
 * `x-webhook-*` constants) emits the canonical capitalised header names.
 */
function normaliseHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (k === 'x-webhook-timestamp') out['X-Webhook-Timestamp'] = v;
    else if (k === 'x-webhook-signature') out['X-Webhook-Signature-256'] = v;
    // eslint-disable-next-line security/detect-object-injection -- keys come from our own header map
    else out[k] = v;
  }
  return out;
}

export interface EnqueueOptions {
  isTest?: boolean;
  /** Skip the per-webhook rate limiter (used by the "send test" endpoint). */
  bypassRateLimit?: boolean;
}

export async function enqueueWebhookDelivery(
  webhookId: string,
  event: string,
  url: string,
  secret: string,
  payload: Record<string, any>,
  options: EnqueueOptions = {}
): Promise<DeliveryDoc> {
  const { valid, reason } = validateWebhookUrl(url);
  if (!valid) {
    const delivery = await WebhookDeliveryModel.create({
      webhookId,
      event,
      url,
      payload,
      status: 'dead',
      attempts: 0,
      isTest: !!options.isTest,
      error: `Blocked URL: ${reason}`,
    });
    logger.error({ webhookId, event, url, reason }, 'Webhook delivery blocked: invalid URL');
    return delivery;
  }

  // Apply the webhook's payload template (if any) so history + retries all
  // carry the final shape. Best-effort — a template lookup failure must not
  // stop the delivery.
  let finalPayload = payload;
  try {
    const webhook = await WebhookModel.findById(webhookId);
    if (webhook?.payloadTemplate) {
      const ctx: EventContext = {
        event,
        data: (payload.data as Record<string, unknown>) ?? payload,
        timestamp: (payload.timestamp as string) ?? new Date().toISOString(),
        webhookId,
        metadata: payload.metadata as Record<string, unknown> | undefined,
      };
      finalPayload = applyTemplate(webhook.payloadTemplate, ctx);
    }

    if (!options.bypassRateLimit && webhook?.rateLimitPerMin) {
      const rl = consumeWebhookRateLimit(webhookId, webhook.rateLimitPerMin);
      if (!rl.allowed) {
        const delivery = await WebhookDeliveryModel.create({
          webhookId,
          event,
          url,
          payload: finalPayload,
          status: 'dead',
          attempts: 0,
          isTest: !!options.isTest,
          error: `Rate limit exceeded (${webhook.rateLimitPerMin}/min) — delivery dropped`,
        });
        logger.warn({ webhookId, event }, 'Webhook delivery dropped: per-webhook rate limit');
        return delivery;
      }
    }
  } catch (err) {
    logger.debug({ err, webhookId }, 'Webhook template/rate-limit pre-processing skipped');
  }

  const delivery = await WebhookDeliveryModel.create({
    webhookId,
    event,
    url,
    payload: finalPayload,
    status: 'pending',
    attempts: 0,
    isTest: !!options.isTest,
  });

  setImmediate(() => {
    executeDelivery(delivery, secret).catch((error) => {
      logger.error({ webhookId, event, url, error }, 'Unhandled error in webhook delivery');
    });
  });

  return delivery;
}

async function executeDelivery(delivery: DeliveryDoc, secret: string): Promise<void> {
  const webhook = await WebhookModel.findById(delivery.webhookId);
  const maxAttempts = webhook?.retryConfig?.maxRetries ?? 3;
  const initialDelay = webhook?.retryConfig?.initialDelayMs ?? 1000;
  const backoffType = webhook?.retryConfig?.backoffType ?? 'exponential';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const bodyString = JSON.stringify(delivery.payload);
    const headers = normaliseHeaders(outboundHeaders(secret, bodyString, delivery));
    const startedAt = Date.now();

    try {
      const response = await axios.post(delivery.url, delivery.payload, {
        headers,
        timeout: 10000,
        validateStatus: (s) => s >= 200 && s < 300,
      });

      delivery.status = 'delivered';
      delivery.attempts = attempt + 1;
      delivery.lastAttemptAt = new Date();
      delivery.responseStatus = response.status;
      delivery.durationMs = Date.now() - startedAt;
      delivery.requestHeaders = redactHeaders(headers);
      delivery.responseBody = truncate(stringifyBody(response.data));
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
      delivery.durationMs = Date.now() - startedAt;
      delivery.requestHeaders = redactHeaders(headers);
      delivery.error = error instanceof Error ? error.message : 'Unknown error';
      const resp = (error as any)?.response;
      if (resp) {
        delivery.responseStatus = resp.status;
        delivery.responseBody = truncate(stringifyBody(resp.data));
      }

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

function truncate(s: string): string {
  return s.length > RESPONSE_BODY_LIMIT ? `${s.slice(0, RESPONSE_BODY_LIMIT)}…[truncated]` : s;
}

function stringifyBody(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  // Signatures are derived from the (visible) body + secret; keep them for
  // debugging but never store the secret itself (it is not in `headers`).
  return { ...headers };
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

/**
 * #1253 — Send a synthetic `webhook.test` event to one webhook so integrators
 * can validate their endpoint + signature handling. Bypasses the per-webhook
 * rate limiter and is flagged `isTest` in the delivery history.
 */
export async function sendTestWebhook(webhook: {
  _id: unknown;
  url: string;
  secret: string;
}): Promise<DeliveryDoc> {
  const payload = {
    event: 'webhook.test',
    data: {
      message: 'This is a test event from Health Watchers.',
      nonce: crypto.randomBytes(8).toString('hex'),
    },
    timestamp: new Date().toISOString(),
  };
  return enqueueWebhookDelivery(
    String(webhook._id),
    'webhook.test',
    webhook.url,
    webhook.secret,
    payload,
    { isTest: true, bypassRateLimit: true }
  );
}
