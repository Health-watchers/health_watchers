import crypto from 'crypto';
import {
  generateWebhookSecret,
  generateWebhookSignature,
  verifyWebhookSignature,
  enqueueWebhookDelivery,
  dispatchWebhookEvent,
} from '../webhook.service';
import { WebhookModel, WebhookDeliveryModel, WebhookEventLogModel } from '../webhook.model';

jest.mock('../webhook.model', () => ({
  WebhookModel: {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  },
  WebhookDeliveryModel: {
    create: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  },
  WebhookEventLogModel: {
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock('@api/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('@api/utils/url-validator', () => ({
  validateWebhookUrl: jest.fn(() => ({ valid: true })),
}));

describe('Webhook Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateWebhookSecret', () => {
    it('should generate a 64-character hex string', () => {
      const secret = generateWebhookSecret();
      expect(secret).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(secret)).toBe(true);
    });

    it('should generate unique secrets', () => {
      const secret1 = generateWebhookSecret();
      const secret2 = generateWebhookSecret();
      expect(secret1).not.toEqual(secret2);
    });
  });

  describe('generateWebhookSignature', () => {
    it('should generate HMAC-SHA256 signature', () => {
      const secret = 'test-secret';
      const payload = '{"event":"test"}';
      const signature = generateWebhookSignature(secret, payload);
      const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      expect(signature).toEqual(expected);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify a valid signature', () => {
      const secret = 'test-secret';
      const payload = '{"event":"test"}';
      const signature = generateWebhookSignature(secret, payload);
      expect(verifyWebhookSignature(secret, payload, signature)).toBe(true);
    });

    it('should reject an invalid signature', () => {
      const secret = 'test-secret';
      const payload = '{"event":"test"}';
      const wrongSignature = 'wrong-signature';
      expect(() => verifyWebhookSignature(secret, payload, wrongSignature)).toThrow();
    });
  });

  describe('enqueueWebhookDelivery', () => {
    it('should create a pending delivery', async () => {
      const mockDelivery = {
        _id: 'delivery-1',
        webhookId: 'wh-1',
        event: 'test.event',
        url: 'https://example.com',
        payload: {},
        status: 'pending',
        attempts: 0,
        save: jest.fn(),
      };

      (WebhookDeliveryModel.create as jest.Mock).mockResolvedValue(mockDelivery);

      const delivery = await enqueueWebhookDelivery(
        'wh-1',
        'test.event',
        'https://example.com',
        'secret',
        { event: 'test.event', data: {} }
      );

      expect(WebhookDeliveryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookId: 'wh-1',
          event: 'test.event',
          url: 'https://example.com',
          status: 'pending',
        })
      );
      expect(delivery).toBeDefined();
    });

    it('should create dead delivery for blocked URLs', async () => {
      const { validateWebhookUrl } = require('@api/utils/url-validator');
      validateWebhookUrl.mockReturnValue({ valid: false, reason: 'Blocked' });

      const mockDelivery = {
        _id: 'delivery-2',
        status: 'dead',
        error: 'Blocked URL: Blocked',
      };

      (WebhookDeliveryModel.create as jest.Mock).mockResolvedValue(mockDelivery);

      const delivery = await enqueueWebhookDelivery(
        'wh-1',
        'test.event',
        'http://internal.local',
        'secret',
        { event: 'test.event', data: {} }
      );

      expect(delivery.status).toEqual('dead');
      expect(delivery.error).toEqual('Blocked URL: Blocked');
    });
  });

  describe('dispatchWebhookEvent', () => {
    it('should dispatch to matching active webhooks', async () => {
      const mockWebhooks = [
        { _id: 'wh-1', url: 'https://example.com', secret: 's1', events: ['test.event'] },
      ];

      (WebhookModel.find as jest.Mock).mockResolvedValue(mockWebhooks);
      (WebhookDeliveryModel.create as jest.Mock).mockResolvedValue({
        _id: 'd1',
        status: 'pending',
      });
      (WebhookEventLogModel.create as jest.Mock).mockResolvedValue({});

      await dispatchWebhookEvent('clinic-1', 'test.event', { id: '123' });

      expect(WebhookModel.find).toHaveBeenCalledWith({
        clinicId: 'clinic-1',
        events: 'test.event',
        isActive: true,
      });
    });

    it('should not dispatch when no webhooks match', async () => {
      (WebhookModel.find as jest.Mock).mockResolvedValue([]);

      await dispatchWebhookEvent('clinic-1', 'no.match', {});

      expect(WebhookDeliveryModel.create).not.toHaveBeenCalled();
    });
  });
});
