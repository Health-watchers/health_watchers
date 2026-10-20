jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  getChannelAdapter,
  registerChannelAdapter,
  smsAdapter,
  pushAdapter,
  NotificationChannelAdapter,
} from '../notification-channels';

describe('notification channel registry', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('exposes built-in adapters for email, sms and push', () => {
    expect(getChannelAdapter('email')?.channel).toBe('email');
    expect(getChannelAdapter('sms')?.channel).toBe('sms');
    expect(getChannelAdapter('push')?.channel).toBe('push');
    expect(getChannelAdapter('in_app')).toBeUndefined();
  });

  it('reports sms/push as unconfigured until provider env vars are set', () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_SMS_FROM;
    delete process.env.FCM_SERVER_KEY;
    expect(smsAdapter.isConfigured()).toBe(false);
    expect(pushAdapter.isConfigured()).toBe(false);

    process.env.TWILIO_ACCOUNT_SID = 'AC1';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    process.env.TWILIO_SMS_FROM = '+15550000000';
    process.env.FCM_SERVER_KEY = 'key';
    expect(smsAdapter.isConfigured()).toBe(true);
    expect(pushAdapter.isConfigured()).toBe(true);
  });

  it('lets a caller replace an adapter (custom provider wiring)', async () => {
    const send = jest.fn().mockResolvedValue({ status: 'sent', providerMessageId: 'x1' });
    const custom: NotificationChannelAdapter = {
      channel: 'sms',
      isConfigured: () => true,
      send,
    };
    registerChannelAdapter(custom);

    const adapter = getChannelAdapter('sms')!;
    const result = await adapter.send({
      channel: 'sms',
      recipient: '+15551112222',
      body: 'hello',
      type: 'system',
    });
    expect(result).toEqual({ status: 'sent', providerMessageId: 'x1' });
    expect(send).toHaveBeenCalledTimes(1);

    // restore the built-in for other test files
    registerChannelAdapter(smsAdapter);
  });
});
