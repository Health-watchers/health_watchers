/**
 * New-device and unusual-location sign-in alerts (#1497).
 */

type Row = Record<string, any>;

const devices: Row[] = [];
const alerts: Row[] = [];

jest.mock('@health-watchers/config', () => ({
  config: { nodeEnv: 'test', jwt: {}, fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345' },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Offline GeoLite2 database stand-in: a fixed IP → country table.
const GEO: Record<string, string> = {
  '8.8.8.8': 'US',
  '8.8.4.4': 'US',
  '81.2.69.142': 'GB',
  '1.1.1.1': 'AU',
};
jest.mock('maxmind', () => ({
  __esModule: true,
  default: {
    open: jest.fn(async () => ({
      get: (ip: string) => (GEO[ip] ? { country: { iso_code: GEO[ip] } } : null),
    })),
    validate: (ip: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.includes(':'),
  },
}));

const sendMail = jest.fn().mockResolvedValue({ messageId: 'm-1' });
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail }) },
  createTransport: () => ({ sendMail }),
}));

jest.mock('@api/modules/auth/models/known-device.model', () => {
  const { Types } = jest.requireActual('mongoose');
  const same = (a: unknown, b: unknown) => String(a) === String(b);
  return {
    KnownDeviceModel: {
      find: (filter: Row) => {
        const rows = devices.filter((d) => same(d.userId, filter.userId));
        const chain: any = { sort: () => chain, lean: async () => rows.map((r) => ({ ...r })) };
        return chain;
      },
      findOneAndUpdate: (filter: Row, update: Row) => ({
        lean: async () => {
          let row = devices.find(
            (d) => same(d.userId, filter.userId) && d.fingerprint === filter.fingerprint
          );
          if (!row) {
            row = { _id: new Types.ObjectId(), ...filter, countries: [], ...update.$setOnInsert };
            devices.push(row);
          }
          Object.assign(row, update.$set);
          for (const [k, v] of Object.entries((update.$addToSet ?? {}) as Row)) {
            if (!row[k].includes(v)) row[k].push(v);
          }
          return { ...row, countries: [...row.countries] };
        },
      }),
      deleteOne: jest.fn(async (filter: Row) => {
        const i = devices.findIndex((d) => same(d._id, filter._id));
        if (i >= 0) devices.splice(i, 1);
      }),
    },
  };
});

jest.mock('@api/modules/auth/models/login-alert.model', () => ({
  LoginAlertModel: {
    create: jest.fn(async (doc: Row) => {
      alerts.push({ ...doc });
      return doc;
    }),
    findOneAndUpdate: (filter: Row, update: Row) => ({
      lean: async () => {
        const row = alerts.find(
          (a) => a.tokenHash === filter.tokenHash && !a.usedAt && a.expiresAt > filter.expiresAt.$gt
        );
        if (!row) return null;
        Object.assign(row, update.$set);
        return { ...row };
      },
    }),
  },
}));

jest.mock('@api/modules/auth/models/refresh-token.model', () => ({
  RefreshTokenModel: { deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }) },
}));

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: {
    findById: () => ({ select: () => ({ lean: async () => ({ clinicId: CLINIC_ID }) }) }),
  },
}));

jest.mock('@api/services/token-denylist.service', () => ({
  setUserInvalidatedAt: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@api/modules/notifications/notification.service', () => ({
  createNotification: jest.fn().mockResolvedValue(null),
}));

jest.mock('@api/modules/audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

import crypto from 'crypto';
import { Types } from 'mongoose';
import {
  describeDevice,
  fingerprintDevice,
  handleSuccessfulLogin,
  lookupCountry,
  resetGeoReader,
  revokeSessionsForAlert,
} from '../login-alert.service';
import { KnownDeviceModel } from '@api/modules/auth/models/known-device.model';
import { RefreshTokenModel } from '@api/modules/auth/models/refresh-token.model';
import { setUserInvalidatedAt } from '@api/services/token-denylist.service';
import { createNotification } from '@api/modules/notifications/notification.service';
import { auditLog } from '@api/modules/audit/audit.service';

const CLINIC_ID = '507f1f77bcf86cd799439011';
const USER_ID = new Types.ObjectId().toHexString();
const user = { id: USER_ID, email: 'nurse@clinic.test', fullName: 'Nora Nurse', clinicId: CLINIC_ID };

const MAC_CHROME_120 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36';
const MAC_CHROME_121 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Safari/537.36';
const WIN_FIREFOX =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';

/** `ip` is what Express resolves from the trusted proxy chain. */
function loginReq(userAgent: string, ip: string): any {
  return { headers: { 'user-agent': userAgent }, ip, socket: {} };
}

/** Sign in as `user` and return the alert outcome. */
const login = (ua: string, ip: string) => handleSuccessfulLogin(user, loginReq(ua, ip));

/** Send real emails through the (mocked) SMTP transport instead of the test no-op. */
async function withEmailDelivery<T>(fn: () => Promise<T>): Promise<T> {
  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    return await fn();
  } finally {
    process.env.NODE_ENV = env;
  }
}

beforeEach(() => {
  devices.length = 0;
  alerts.length = 0;
  jest.clearAllMocks();
  process.env.GEOIP_COUNTRY_DB_PATH = '/data/GeoLite2-Country.mmdb';
  resetGeoReader();
});

describe('device fingerprinting', () => {
  it('labels common browsers and operating systems', () => {
    expect(describeDevice(MAC_CHROME_120)).toBe('Chrome on macOS');
    expect(describeDevice(WIN_FIREFOX)).toBe('Firefox on Windows');
    expect(describeDevice(IPHONE_SAFARI)).toBe('Safari on iOS');
    expect(describeDevice(undefined)).toBe('Unknown device');
  });

  it('ignores browser and OS version upgrades', () => {
    expect(fingerprintDevice(MAC_CHROME_120)).toBe(fingerprintDevice(MAC_CHROME_121));
    expect(fingerprintDevice(MAC_CHROME_120)).not.toBe(fingerprintDevice(WIN_FIREFOX));
  });
});

describe('lookupCountry', () => {
  it('resolves public IPs to an ISO country code', async () => {
    expect(await lookupCountry('81.2.69.142')).toBe('GB');
    expect(await lookupCountry('::ffff:8.8.8.8')).toBe('US');
  });

  it('returns null for unknown or invalid addresses', async () => {
    expect(await lookupCountry('10.0.0.1')).toBeNull();
    expect(await lookupCountry('not-an-ip')).toBeNull();
    expect(await lookupCountry(undefined)).toBeNull();
  });

  it('returns null when no GeoLite2 database is configured', async () => {
    delete process.env.GEOIP_COUNTRY_DB_PATH;
    resetGeoReader();
    expect(await lookupCountry('8.8.8.8')).toBeNull();
  });
});

describe('handleSuccessfulLogin', () => {
  it('treats the first sign-in as the baseline and does not alert', async () => {
    const result = await login(MAC_CHROME_120, '8.8.8.8');

    expect(result?.reasons).toEqual([]);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ deviceLabel: 'Chrome on macOS', countries: ['US'] });
    expect(createNotification).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(0);
  });

  it('does not alert for a known device in a known country', async () => {
    await login(MAC_CHROME_120, '8.8.8.8');
    const result = await withEmailDelivery(() => login(MAC_CHROME_121, '8.8.4.4'));

    expect(result?.reasons).toEqual([]);
    expect(devices).toHaveLength(1);
    expect(sendMail).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('alerts on a new device by email and in-app with a revoke link', async () => {
    await login(MAC_CHROME_120, '8.8.8.8');
    const result = await withEmailDelivery(() => login(WIN_FIREFOX, '8.8.8.8'));

    expect(result?.reasons).toEqual(['NEW_DEVICE']);
    expect(devices).toHaveLength(2);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ reasons: ['NEW_DEVICE'], deviceLabel: 'Firefox on Windows' });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe(user.email);
    expect(mail.text).toContain('Firefox on Windows');
    expect(mail.text).toContain('United States');
    expect(mail.html).toContain("This wasn't me");
    expect(mail.text).toMatch(/\/not-me\?token=[a-f0-9]{64}/);

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        type: 'security_alert',
        title: 'Sign-in from a new device',
        link: expect.stringMatching(/^\/not-me\?token=[a-f0-9]{64}$/),
      })
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'NEW_DEVICE_LOGIN',
        metadata: expect.objectContaining({ reasons: ['NEW_DEVICE'], country: 'US' }),
      }),
      expect.anything()
    );
  });

  it('alerts on a known device signing in from a new country', async () => {
    await login(MAC_CHROME_120, '8.8.8.8');
    const result = await withEmailDelivery(() => login(MAC_CHROME_120, '81.2.69.142'));

    expect(result?.reasons).toEqual(['NEW_COUNTRY']);
    expect(devices[0].countries).toEqual(['US', 'GB']);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.text).toContain('a new location');
    expect(mail.text).toContain('United Kingdom');
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sign-in from a new location' })
    );
  });

  it('reports both reasons for a new device in a new country', async () => {
    await login(MAC_CHROME_120, '8.8.8.8');
    const result = await withEmailDelivery(() => login(IPHONE_SAFARI, '1.1.1.1'));

    expect(result?.reasons).toEqual(['NEW_DEVICE', 'NEW_COUNTRY']);
    expect(sendMail.mock.calls[0][0].text).toContain('a new device in a new location');
  });

  it('accepts a country once it has been seen, on any device', async () => {
    await login(MAC_CHROME_120, '8.8.8.8');
    await login(MAC_CHROME_120, '81.2.69.142');
    jest.clearAllMocks();

    const result = await login(MAC_CHROME_120, '81.2.69.142');
    expect(result?.reasons).toEqual([]);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('never puts the raw IP address in an email or in-app alert', async () => {
    const ips = ['8.8.8.8', '81.2.69.142', '1.1.1.1'];
    await login(MAC_CHROME_120, ips[0]);
    await withEmailDelivery(async () => {
      await login(WIN_FIREFOX, ips[1]);
      await login(IPHONE_SAFARI, ips[2]);
    });

    expect(sendMail).toHaveBeenCalledTimes(2);
    const delivered = JSON.stringify([
      sendMail.mock.calls,
      (createNotification as jest.Mock).mock.calls,
      alerts,
      devices,
    ]);
    for (const ip of ips) expect(delivered).not.toContain(ip);
  });

  it('locates the client from the trusted proxy chain, not a forgeable header', async () => {
    await login(MAC_CHROME_120, '8.8.8.8');
    const req = loginReq(MAC_CHROME_120, '81.2.69.142');
    req.headers['x-forwarded-for'] = '8.8.8.8';

    const result = await handleSuccessfulLogin(user, req);
    expect(result?.reasons).toEqual(['NEW_COUNTRY']);
  });

  it('never fails the sign-in when alerting breaks', async () => {
    jest.spyOn(KnownDeviceModel, 'find').mockImplementationOnce(() => {
      throw new Error('db down');
    });
    await expect(login(MAC_CHROME_120, '8.8.8.8')).resolves.toBeNull();
  });
});

describe('revokeSessionsForAlert ("This wasn\'t me")', () => {
  async function issueAlert(): Promise<string> {
    await login(MAC_CHROME_120, '8.8.8.8');
    await login(WIN_FIREFOX, '81.2.69.142');
    const link = (createNotification as jest.Mock).mock.calls[0][0].link as string;
    return link.split('token=')[1];
  }

  it('stores only a hash of the revoke token', async () => {
    const token = await issueAlert();
    expect(alerts[0].tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(alerts)).not.toContain(token);
  });

  it('revokes every session and forgets the reported device', async () => {
    const token = await issueAlert();
    expect(devices).toHaveLength(2);

    const result = await revokeSessionsForAlert(token);

    expect(result).toEqual({ userId: USER_ID });
    expect(RefreshTokenModel.deleteMany).toHaveBeenCalledWith({ userId: USER_ID });
    expect(setUserInvalidatedAt).toHaveBeenCalledWith(USER_ID, expect.any(Number));
    expect(devices.map((d) => d.deviceLabel)).toEqual(['Chrome on macOS']);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UNRECOGNIZED_LOGIN_REPORTED', clinicId: CLINIC_ID }),
      undefined
    );
  });

  it('is single use', async () => {
    const token = await issueAlert();
    expect(await revokeSessionsForAlert(token)).not.toBeNull();
    expect(await revokeSessionsForAlert(token)).toBeNull();
  });

  it('rejects expired and unknown tokens', async () => {
    const token = await issueAlert();
    alerts[0].expiresAt = new Date(Date.now() - 1);
    expect(await revokeSessionsForAlert(token)).toBeNull();
    expect(await revokeSessionsForAlert('f'.repeat(64))).toBeNull();
    expect(RefreshTokenModel.deleteMany).not.toHaveBeenCalled();
  });
});
