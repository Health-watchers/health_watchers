import { registerWebhookSchema, inboundWebhookSchema } from '../webhook.validation';

describe('registerWebhookSchema', () => {
  it('accepts a valid public HTTPS url with supported events', () => {
    const result = registerWebhookSchema.safeParse({
      url: 'https://example.com/webhooks/health-watchers',
      events: ['payment.confirmed'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unsupported event type', () => {
    const result = registerWebhookSchema.safeParse({
      url: 'https://example.com/webhooks',
      events: ['patient.exploded'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects the reserved webhook.test event on registration', () => {
    const result = registerWebhookSchema.safeParse({
      url: 'https://example.com/webhooks',
      events: ['webhook.test'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty events array', () => {
    const result = registerWebhookSchema.safeParse({
      url: 'https://example.com/webhooks',
      events: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a URL pointing at a private/loopback IP', () => {
    const result = registerWebhookSchema.safeParse({
      url: 'http://127.0.0.1/webhooks',
      events: ['payment.confirmed'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed URL', () => {
    const result = registerWebhookSchema.safeParse({
      url: 'not-a-url',
      events: ['payment.confirmed'],
    });
    expect(result.success).toBe(false);
  });
});

describe('inboundWebhookSchema', () => {
  it('accepts a valid inbound payment webhook payload', () => {
    const result = inboundWebhookSchema.safeParse({
      transactionHash: 'abc123',
      amount: '100.00',
      destination: 'GABC...',
      status: 'confirmed',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status value', () => {
    const result = inboundWebhookSchema.safeParse({
      transactionHash: 'abc123',
      amount: '100.00',
      destination: 'GABC...',
      status: 'pending',
    });
    expect(result.success).toBe(false);
  });
});
