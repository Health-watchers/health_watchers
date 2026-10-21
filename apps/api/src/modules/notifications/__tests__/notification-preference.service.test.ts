import { resolveChannels, isWithinQuietHours } from '../notification-preference.service';
import { NotificationPreferenceModel } from '../notification-preference.model';
import { UserModel } from '../../auth/models/user.model';

jest.mock('../notification-preference.model', () => ({
  NotificationPreferenceModel: { findOne: jest.fn() },
}));
jest.mock('../../auth/models/user.model', () => ({ UserModel: { findById: jest.fn() } }));
jest.mock('../notification-template.model', () => ({
  NOTIFICATION_CHANNELS: ['in_app', 'email', 'sms', 'push'],
}));

const findPref = NotificationPreferenceModel.findOne as jest.Mock;
const findUser = UserModel.findById as jest.Mock;
const lean = (v: unknown): { lean: jest.Mock } => ({ lean: jest.fn().mockResolvedValue(v) });

beforeEach(() => {
  jest.clearAllMocks();
  findPref.mockReturnValue(lean(null));
  findUser.mockReturnValue(lean(null));
});

describe('isWithinQuietHours', () => {
  it('handles overnight windows that wrap past midnight', () => {
    const qh = { enabled: true, start: '22:00', end: '07:00', timezone: 'UTC' };
    expect(isWithinQuietHours(qh, new Date('2026-01-01T23:30:00Z'))).toBe(true);
    expect(isWithinQuietHours(qh, new Date('2026-01-01T05:00:00Z'))).toBe(true);
    expect(isWithinQuietHours(qh, new Date('2026-01-01T12:00:00Z'))).toBe(false);
  });

  it('is inert when disabled', () => {
    expect(
      isWithinQuietHours({ enabled: false, start: '00:00', end: '23:59', timezone: 'UTC' })
    ).toBe(false);
  });
});

describe('resolveChannels', () => {
  it('returns every requested channel when nothing is restricted', async () => {
    const res = await resolveChannels({ userId: 'u1', type: 'system' });
    expect(res.channels).toEqual(['in_app', 'email', 'sms', 'push']);
    expect(res.suppressed).toEqual([]);
  });

  it('suppresses everything when the legacy per-type flag is off', async () => {
    findUser.mockReturnValue(lean({ preferences: { notificationTypes: { system: false } } }));
    const res = await resolveChannels({ userId: 'u1', type: 'system' });
    expect(res.channels).toEqual([]);
    expect(res.suppressed.every((s) => s.reason === 'type_disabled')).toBe(true);
  });

  it('lets critical notification types bypass a disabled preference doc', async () => {
    findPref.mockReturnValue(lean({ enabled: false, channels: { email: false } }));
    const res = await resolveChannels({ userId: 'u1', type: 'balance_critical' });
    expect(res.channels).toContain('email');
  });

  it('drops channels turned off in the preference doc', async () => {
    findPref.mockReturnValue(
      lean({ enabled: true, channels: { in_app: true, email: false, sms: true, push: true } })
    );
    const res = await resolveChannels({ userId: 'u1', type: 'system' });
    expect(res.channels).not.toContain('email');
    expect(res.suppressed).toContainEqual({ channel: 'email', reason: 'channel_disabled' });
  });

  it('defers non-critical channels during quiet hours', async () => {
    findPref.mockReturnValue(
      lean({
        enabled: true,
        channels: { in_app: true, email: true, sms: true, push: true },
        quietHours: { enabled: true, start: '22:00', end: '07:00', timezone: 'UTC' },
      })
    );
    const res = await resolveChannels({
      userId: 'u1',
      type: 'system',
      now: new Date('2026-01-01T23:00:00Z'),
    });
    expect(res.deferUntil).toBeInstanceOf(Date);
    expect(res.deferUntil!.getTime()).toBeGreaterThan(new Date('2026-01-01T23:00:00Z').getTime());
  });
});
