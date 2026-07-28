import mongoose from 'mongoose';
import { WebhookModel, WebhookDeliveryModel } from '../webhook.model';

describe('WebhookModel', () => {
  it('validates a complete webhook record', async () => {
    const webhook = new WebhookModel({
      clinicId: new mongoose.Types.ObjectId(),
      url: 'https://example.com/hooks/health-watchers',
      events: ['payment.confirmed'],
      secret: 'shh',
    });
    await expect(webhook.validate()).resolves.toBeUndefined();
  });

  it('requires url', async () => {
    const webhook = new WebhookModel({
      clinicId: new mongoose.Types.ObjectId(),
      events: ['payment.confirmed'],
      secret: 'shh',
    });
    await expect(webhook.validate()).rejects.toThrow(/url/);
  });

  it('defaults isActive to true', () => {
    const webhook = new WebhookModel({
      clinicId: new mongoose.Types.ObjectId(),
      url: 'https://example.com',
      events: ['payment.confirmed'],
      secret: 'shh',
    });
    expect(webhook.isActive).toBe(true);
  });
});

describe('WebhookDeliveryModel', () => {
  it('validates a complete delivery record', async () => {
    const delivery = new WebhookDeliveryModel({
      webhookId: new mongoose.Types.ObjectId(),
      event: 'payment.confirmed',
      url: 'https://example.com/hooks',
      payload: { amount: 100 },
    });
    await expect(delivery.validate()).resolves.toBeUndefined();
  });

  it('defaults status to pending and attempts to 0', () => {
    const delivery = new WebhookDeliveryModel({
      webhookId: new mongoose.Types.ObjectId(),
      event: 'payment.confirmed',
      url: 'https://example.com/hooks',
      payload: {},
    });
    expect(delivery.status).toBe('pending');
    expect(delivery.attempts).toBe(0);
  });

  it('rejects an invalid status', async () => {
    const delivery = new WebhookDeliveryModel({
      webhookId: new mongoose.Types.ObjectId(),
      event: 'payment.confirmed',
      url: 'https://example.com/hooks',
      payload: {},
      status: 'sent',
    });
    await expect(delivery.validate()).rejects.toThrow();
  });
});
