jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { dispatchNotification, attemptDelivery } from '../notification-dispatch.service';
import { NotificationDeliveryModel } from '../notification-delivery.model';
import { NotificationModel } from '../notification.model';
import { UserModel } from '../../auth/models/user.model';
import { resolveChannels } from '../notification-preference.service';
import { renderTemplate } from '../notification-template.service';
import { getChannelAdapter } from '../notification-channels';

jest.mock('../notification-delivery.model', () => ({
  DELIVERY_STATUSES: ['pending', 'sent', 'delivered', 'failed', 'bounced', 'skipped'],
  NotificationDeliveryModel: { create: jest.fn(), findById: jest.fn(), find: jest.fn() },
}));
jest.mock('../notification.model', () => ({
  NOTIFICATION_TYPES: ['system'],
  NotificationModel: { create: jest.fn() },
}));
jest.mock('../notification-template.model', () => ({
  NOTIFICATION_CHANNELS: ['in_app', 'email', 'sms', 'push'],
  TEMPLATE_LOCALES: ['en', 'fr'],
}));
jest.mock('../../auth/models/user.model', () => ({ UserModel: { findById: jest.fn() } }));
jest.mock('../notification-preference.service', () => ({ resolveChannels: jest.fn() }));
jest.mock('../notification-template.service', () => ({ renderTemplate: jest.fn() }));
jest.mock('../notification-channels', () => ({ getChannelAdapter: jest.fn() }));
jest.mock('../../audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@api/realtime/socket', () => ({ emitToUser: jest.fn() }));

const createDelivery = NotificationDeliveryModel.create as jest.Mock;
const findByIdDelivery = NotificationDeliveryModel.findById as jest.Mock;
const createNotification = NotificationModel.create as jest.Mock;
const findUser = UserModel.findById as jest.Mock;
const mockResolveChannels = resolveChannels as jest.Mock;
const mockRender = renderTemplate as jest.Mock;
const mockGetAdapter = getChannelAdapter as jest.Mock;

interface FakeDelivery {
  _id: string;
  channel: string;
  userId: string;
  clinicId: string;
  type: string;
  recipient: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  scheduledFor?: Date;
  nextRetryAt?: Date;
  notificationId?: string;
  metadata: Record<string, unknown>;
  lastError?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  providerMessageId?: string;
  save: jest.Mock;
}

function fakeDelivery(overrides: Partial<FakeDelivery> = {}): FakeDelivery {
  return {
    _id: 'd1',
    channel: 'email',
    userId: 'u1',
    clinicId: 'c1',
    type: 'system',
    recipient: 'ada@example.com',
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    metadata: { subject: 'Hi', body: 'Hello' },
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  findUser.mockReturnValue({
    lean: jest
      .fn()
      .mockResolvedValue({ email: 'ada@example.com', portalPhoneNumber: '+15550001111' }),
  });
  mockRender.mockResolvedValue({
    subject: 'Rendered',
    body: 'Rendered body',
    missingVariables: [],
  });
});

describe('dispatchNotification', () => {
  it('fans out to resolved channels, creates the in-app notification and audits', async () => {
    mockResolveChannels.mockResolvedValue({
      channels: ['in_app', 'email'],
      suppressed: [{ channel: 'sms', reason: 'channel_disabled' }],
    });
    createNotification.mockResolvedValue({ _id: 'n1' });
    mockGetAdapter.mockReturnValue({
      channel: 'email',
      isConfigured: () => true,
      send: jest.fn().mockResolvedValue({ status: 'sent', providerMessageId: 'p1' }),
    });

    const created: FakeDelivery[] = [];
    createDelivery.mockImplementation((doc: Record<string, unknown>) => {
      const d = fakeDelivery({
        _id: `d${created.length + 1}`,
        channel: doc.channel as string,
        recipient: doc.recipient as string,
        metadata: doc.metadata as Record<string, unknown>,
      });
      created.push(d);
      return d;
    });
    findByIdDelivery.mockReturnValue({
      select: (): { lean: () => Promise<{ notificationId: string }> } => ({
        lean: (): Promise<{ notificationId: string }> => Promise.resolve({ notificationId: 'n1' }),
      }),
    });

    const result = await dispatchNotification({
      userId: 'u1',
      clinicId: 'c1',
      type: 'system',
      title: 'Hi',
      message: 'Hello',
    });

    expect(result.deliveries.map((d) => d.channel)).toEqual(['in_app', 'email']);
    expect(result.notificationId).toBe('n1');
    expect(result.suppressed).toContainEqual({ channel: 'sms', reason: 'channel_disabled' });
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('marks a channel skipped when there is no recipient for it', async () => {
    mockResolveChannels.mockResolvedValue({ channels: ['push'], suppressed: [] });
    findUser.mockReturnValue({ lean: jest.fn().mockResolvedValue({ email: 'ada@example.com' }) });

    const result = await dispatchNotification({
      userId: 'u1',
      clinicId: 'c1',
      type: 'system',
      message: 'Hello',
    });

    expect(result.deliveries).toHaveLength(0);
    expect(result.suppressed).toContainEqual({ channel: 'push', reason: 'no_recipient' });
    expect(createDelivery).not.toHaveBeenCalled();
  });

  it('holds a channel as pending when scheduledFor is in the future', async () => {
    mockResolveChannels.mockResolvedValue({ channels: ['email'], suppressed: [] });
    const future = new Date(Date.now() + 3_600_000);
    const d = fakeDelivery({ scheduledFor: future });
    createDelivery.mockResolvedValue(d);

    const result = await dispatchNotification({
      userId: 'u1',
      clinicId: 'c1',
      type: 'system',
      message: 'Hello',
      scheduledFor: future,
    });

    expect(result.deliveries[0].status).toBe('pending');
    expect(d.save).not.toHaveBeenCalled();
  });
});

describe('attemptDelivery', () => {
  it('schedules a retry with backoff when the provider fails and attempts remain', async () => {
    mockGetAdapter.mockReturnValue({
      channel: 'email',
      isConfigured: () => true,
      send: jest.fn().mockResolvedValue({ status: 'failed', error: 'smtp down' }),
    });
    const d = fakeDelivery({ attempts: 1, maxAttempts: 5 });

    const status = await attemptDelivery(d as never);

    expect(status).toBe('pending');
    expect(d.attempts).toBe(2);
    expect(d.lastError).toBe('smtp down');
    expect(d.nextRetryAt).toBeInstanceOf(Date);
    expect(d.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('fails permanently once maxAttempts is reached', async () => {
    mockGetAdapter.mockReturnValue({
      channel: 'email',
      isConfigured: () => true,
      send: jest.fn().mockResolvedValue({ status: 'failed', error: 'smtp down' }),
    });
    const d = fakeDelivery({ attempts: 4, maxAttempts: 5 });

    const status = await attemptDelivery(d as never);

    expect(status).toBe('failed');
    expect(d.failedAt).toBeInstanceOf(Date);
    expect(d.nextRetryAt).toBeUndefined();
  });

  it('skips a channel whose adapter is not configured', async () => {
    mockGetAdapter.mockReturnValue({
      channel: 'sms',
      isConfigured: () => false,
      send: jest.fn(),
    });
    const d = fakeDelivery({ channel: 'sms', recipient: '+15550001111' });

    const status = await attemptDelivery(d as never);

    expect(status).toBe('skipped');
    expect(d.lastError).toBe('channel_not_configured');
  });
});
