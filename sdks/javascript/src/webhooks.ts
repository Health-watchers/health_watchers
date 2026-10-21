import crypto from 'crypto';

/**
 * Verifies the `X-Webhook-Signature` header the Health Watchers API sends
 * with every webhook delivery.
 *
 * The API computes the signature as:
 *
 *   crypto.createHmac('sha256', secret).update(rawPayload).digest('hex')
 *
 * where `rawPayload` is the exact JSON string that was sent as the request
 * body (see `generateWebhookSignature` in
 * `apps/api/src/modules/webhooks/webhook.service.ts`). Recompute the same
 * digest here and compare it in constant time to avoid leaking timing
 * information about how much of the signature matched.
 *
 * IMPORTANT: pass the *raw* request body string (e.g. `req.rawBody` or the
 * unparsed text your framework gives you), not a re-serialized/parsed
 * object — re-serializing JSON can change key order/whitespace and cause
 * a false negative.
 *
 * @param secret    The webhook's signing secret, issued when the webhook was created.
 * @param payload   The raw request body string, exactly as received.
 * @param signature The value of the `X-Webhook-Signature` header.
 * @returns true if the signature is valid, false otherwise (including on any malformed input).
 */
export function verifyWebhookSignature(secret: string, payload: string, signature: string): boolean {
  if (!secret || !payload || !signature) return false;

  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(signature, 'hex');

  // crypto.timingSafeEqual throws if the buffers differ in length, so guard
  // that first — a length mismatch just means "not equal", not an error.
  if (expectedBuffer.length !== actualBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
