import axios from 'axios';
import {
  enqueueWebhookDelivery,
  generateWebhookSecret,
  generateWebhookSignature,
  verifyWebhookSignature,
} from '../webhook.service';
import { WebhookDeliveryModel } from '../webhook.model';
import { validateWebhookUrl } from '@api/utils/url-validator';

jest.mock('axios');
jest.mock('../webhook.model', () => ({
  WebhookDeliveryModel: { findOne: jest.fn(), create: jest.fn() },
}));
jest.mock('@api/utils/url-validator', () => ({ validateWebhookUrl: jest.fn() }));

async function flush(cycles = 8) {
  for (let i = 0; i < cycles; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe('webhook crypto helpers', () => {
  it('generateWebhookSecret returns a 64-char hex string', () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generateWebhookSecret returns unique values on each call', () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });

  it('generateWebhookSignature is deterministic for the same secret/payload', () => {
    const sig1 = generateWebhookSignature('secret', '{"a":1}');
    const sig2 = generateWebhookSignature('secret', '{"a":1}');
    expect(sig1).toBe(sig2);
  });

  it('generateWebhookSignature differs for different secrets', () => {
    const sig1 = generateWebhookSignature('secret-a', '{"a":1}');
    const sig2 = generateWebhookSignature('secret-b', '{"a":1}');
    expect(sig1).not.toBe(sig2);
  });

  it('verifyWebhookSignature returns true for a matching signature', () => {
    const payload = '{"a":1}';
    const sig = generateWebhookSignature('secret', payload);
    expect(verifyWebhookSignature('secret', payload, sig)).toBe(true);
  });

  it('verifyWebhookSignature returns false for a wrong (same-length) signature', () => {
    const payload = '{"a":1}';
    const real = generateWebhookSignature('secret', payload);
    const tampered = '0'.repeat(real.length);
    expect(verifyWebhookSignature('secret', payload, tampered)).toBe(false);
  });
});

describe('enqueueWebhookDelivery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks the delivery as failed without calling axios when the URL is blocked', async () => {
    (validateWebhookUrl as jest.Mock).mockReturnValue({ valid: false, reason: 'blocked IP range' });
    const delivery: any = { status: 'pending', save: jest.fn().mockResolvedValue(undefined) };
    (WebhookDeliveryModel.findOne as jest.Mock).mockResolvedValue(delivery);

    await enqueueWebhookDelivery('wh1', 'payment.confirmed', 'http://127.0.0.1', 'secret', { amount: 1 });
    await flush();

    expect(delivery.status).toBe('failed');
    expect(delivery.error).toMatch(/blocked IP range/);
    expect(delivery.save).toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('creates a new pending delivery when none exists, then marks it delivered on success', async () => {
    (validateWebhookUrl as jest.Mock).mockReturnValue({ valid: true });
    (WebhookDeliveryModel.findOne as jest.Mock).mockResolvedValue(null);
    const delivery: any = { status: 'pending', attempts: 0, save: jest.fn().mockResolvedValue(undefined) };
    (WebhookDeliveryModel.create as jest.Mock).mockResolvedValue(delivery);
    (axios.post as jest.Mock).mockResolvedValue({ status: 200 });

    await enqueueWebhookDelivery('wh1', 'payment.confirmed', 'https://example.com/hook', 'secret', {
      amount: 1,
    });
    await flush();

    expect(WebhookDeliveryModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookId: 'wh1',
        event: 'payment.confirmed',
        status: 'pending',
        attempts: 0,
      })
    );
    expect(axios.post).toHaveBeenCalledWith(
      'https://example.com/hook',
      { amount: 1 },
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Webhook-Signature': expect.any(String) }),
      })
    );
    expect(delivery.status).toBe('delivered');
    expect(delivery.attempts).toBe(1);
  });

  it('reuses an existing pending delivery instead of creating a new one', async () => {
    (validateWebhookUrl as jest.Mock).mockReturnValue({ valid: true });
    const delivery: any = { status: 'pending', attempts: 0, save: jest.fn().mockResolvedValue(undefined) };
    (WebhookDeliveryModel.findOne as jest.Mock).mockResolvedValue(delivery);
    (axios.post as jest.Mock).mockResolvedValue({ status: 200 });

    await enqueueWebhookDelivery('wh1', 'payment.confirmed', 'https://example.com/hook', 'secret', {});
    await flush();

    expect(WebhookDeliveryModel.create).not.toHaveBeenCalled();
    expect(delivery.status).toBe('delivered');
  });
});
