/**
 * New-device and unusual-location sign-in alerts (#1497).
 *
 * Each successful sign-in is fingerprinted by its user agent (version numbers
 * stripped, so browser updates do not look like new devices) and coarsely
 * geolocated to a country with an offline MaxMind GeoLite2 Country database
 * (`GEOIP_COUNTRY_DB_PATH`). A sign-in from an unrecognised device or country
 * triggers an email and an in-app alert carrying a single-use "This wasn't me"
 * link that revokes every session for the account. Raw IPs are never stored by
 * this service nor included in any alert.
 */
import crypto from 'crypto';
import { Request } from 'express';
import { Types } from 'mongoose';
import maxmind, { CountryResponse, Reader } from 'maxmind';
import { KnownDevice, KnownDeviceModel } from '../models/known-device.model';
import { LoginAlertModel, LoginAlertReason } from '../models/login-alert.model';
import { RefreshTokenModel } from '../models/refresh-token.model';
import { UserModel } from '../models/user.model';
import { setUserInvalidatedAt } from '@api/services/token-denylist.service';
import { sendNewLoginAlertEmail } from '@api/lib/email.service';
import { createNotification } from '../../notifications/notification.service';
import { auditLog } from '../../audit/audit.service';
import logger from '@api/utils/logger';

export const LOGIN_ALERT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const APP_BASE_URL = () => process.env.APP_BASE_URL || 'http://localhost:3000';

// ── Device fingerprinting ────────────────────────────────────────────────────

const BROWSERS: [RegExp, string][] = [
  [/edg(e|a|ios)?\//i, 'Edge'],
  [/opr\/|opera/i, 'Opera'],
  [/samsungbrowser/i, 'Samsung Internet'],
  [/firefox|fxios/i, 'Firefox'],
  [/chrome|crios|chromium/i, 'Chrome'],
  [/safari/i, 'Safari'],
];

const OPERATING_SYSTEMS: [RegExp, string][] = [
  [/windows/i, 'Windows'],
  [/iphone|ipad|ipod/i, 'iOS'],
  [/android/i, 'Android'],
  [/cros/i, 'ChromeOS'],
  [/mac os x|macintosh/i, 'macOS'],
  [/linux/i, 'Linux'],
];

export function describeDevice(userAgent: string | undefined): string {
  if (!userAgent) return 'Unknown device';
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const os = OPERATING_SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}

/** Stable per browser/OS install: version numbers are removed before hashing. */
export function fingerprintDevice(userAgent: string | undefined): string {
  const normalized = (userAgent ?? '')
    .toLowerCase()
    .replace(/\d+([._]\d+)*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// ── Coarse geolocation (offline GeoLite2 Country database) ───────────────────

let geoReader: Promise<Reader<CountryResponse> | null> | null = null;

function getGeoReader(): Promise<Reader<CountryResponse> | null> {
  if (!geoReader) {
    const dbPath = process.env.GEOIP_COUNTRY_DB_PATH;
    geoReader = dbPath
      ? maxmind.open<CountryResponse>(dbPath).catch((err) => {
          logger.warn({ err, dbPath }, 'GeoLite2 database unavailable — country alerts disabled');
          return null;
        })
      : Promise.resolve(null);
  }
  return geoReader;
}

/** Test helper — reload the GeoLite2 database on next lookup. */
export function resetGeoReader(): void {
  geoReader = null;
}

/** ISO 3166-1 alpha-2 country code for an IP, or null if unknown/private. */
export async function lookupCountry(ip: string | undefined): Promise<string | null> {
  const addr = ip?.replace(/^::ffff:/, '');
  if (!addr || !maxmind.validate(addr)) return null;
  const reader = await getGeoReader();
  return reader?.get(addr)?.country?.iso_code ?? null;
}

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Client IP as resolved by Express's `trust proxy` setting. Unlike reading
 * X-Forwarded-For directly, a client cannot forge this to look like it is
 * signing in from a familiar country.
 */
function clientIp(req: Request): string | undefined {
  return req.ip ?? req.socket?.remoteAddress;
}

// ── Sign-in assessment ───────────────────────────────────────────────────────

export interface LoginAssessment {
  device: KnownDevice & { _id: Types.ObjectId };
  country: string | null;
  reasons: LoginAlertReason[];
}

/**
 * Compare this sign-in with the user's recognised devices and countries, then
 * record it. The very first sign-in we see for a user establishes the baseline
 * and never alerts.
 */
export async function assessLogin(
  userId: string,
  userAgent: string | undefined,
  ip: string | undefined,
  now = new Date()
): Promise<LoginAssessment> {
  const fingerprint = fingerprintDevice(userAgent);
  const [devices, country] = await Promise.all([
    KnownDeviceModel.find({ userId: new Types.ObjectId(userId) }).lean(),
    lookupCountry(ip),
  ]);

  const reasons: LoginAlertReason[] = [];
  if (devices.length > 0) {
    if (!devices.some((d) => d.fingerprint === fingerprint)) reasons.push('NEW_DEVICE');
    const knownCountries = new Set(devices.flatMap((d) => d.countries ?? []));
    if (country && knownCountries.size > 0 && !knownCountries.has(country)) {
      reasons.push('NEW_COUNTRY');
    }
  }

  const device = await KnownDeviceModel.findOneAndUpdate(
    { userId: new Types.ObjectId(userId), fingerprint },
    {
      $set: {
        deviceLabel: describeDevice(userAgent),
        userAgent: userAgent?.slice(0, 512),
        lastSeenAt: now,
        ...(country ? { lastCountry: country } : {}),
      },
      $setOnInsert: { firstSeenAt: now },
      ...(country ? { $addToSet: { countries: country } } : {}),
    },
    { upsert: true, new: true }
  ).lean<KnownDevice & { _id: Types.ObjectId }>();

  return { device: device!, country, reasons };
}

interface AlertableUser {
  _id?: unknown;
  id?: string;
  email: string;
  fullName: string;
  clinicId: unknown;
}

/**
 * Called after every successful sign-in. Never throws — alerting must not block
 * or fail a login.
 */
export async function handleSuccessfulLogin(
  user: AlertableUser,
  req: Request,
  now = new Date()
): Promise<LoginAssessment | null> {
  try {
    const userId = String(user.id ?? user._id);
    const assessment = await assessLogin(userId, req.headers['user-agent'], clientIp(req), now);
    if (assessment.reasons.length === 0) return assessment;

    const token = crypto.randomBytes(32).toString('hex');
    await LoginAlertModel.create({
      userId: new Types.ObjectId(userId),
      knownDeviceId: assessment.device._id,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      reasons: assessment.reasons,
      deviceLabel: assessment.device.deviceLabel,
      country: assessment.country ?? undefined,
      createdAt: now,
      expiresAt: new Date(now.getTime() + LOGIN_ALERT_TTL_MS),
    });

    const revokePath = `/not-me?token=${token}`;
    const location = countryName(assessment.country);
    const newDevice = assessment.reasons.includes('NEW_DEVICE');
    const newCountry = assessment.reasons.includes('NEW_COUNTRY');

    sendNewLoginAlertEmail(user.email, user.fullName, {
      deviceLabel: assessment.device.deviceLabel,
      location,
      occurredAt: now,
      newDevice,
      newCountry,
      revokeUrl: `${APP_BASE_URL()}${revokePath}`,
    });

    await createNotification({
      userId,
      clinicId: String(user.clinicId),
      type: 'security_alert',
      title: newCountry ? 'Sign-in from a new location' : 'Sign-in from a new device',
      message: `${assessment.device.deviceLabel}${location ? ` in ${location}` : ''}. If this wasn't you, sign out all sessions now.`,
      link: revokePath,
      metadata: { reasons: assessment.reasons, country: assessment.country },
    });

    await auditLog(
      {
        action: 'NEW_DEVICE_LOGIN',
        userId,
        clinicId: String(user.clinicId),
        metadata: {
          reasons: assessment.reasons,
          deviceLabel: assessment.device.deviceLabel,
          country: assessment.country,
        },
      },
      req
    );
    return assessment;
  } catch (err) {
    logger.error({ err }, 'Failed to evaluate sign-in for new-device alert');
    return null;
  }
}

/**
 * "This wasn't me": revoke every session for the alert's user and forget the
 * device so any further sign-in from it alerts again. Single use.
 */
export async function revokeSessionsForAlert(
  token: string,
  req?: Request
): Promise<{ userId: string } | null> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const alert = await LoginAlertModel.findOneAndUpdate(
    { tokenHash, usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  ).lean();
  if (!alert) return null;

  const userId = String(alert.userId);
  const [user] = await Promise.all([
    UserModel.findById(userId).select('clinicId').lean<{ clinicId?: unknown } | null>(),
    RefreshTokenModel.deleteMany({ userId }),
    setUserInvalidatedAt(userId, Math.floor(Date.now() / 1000)),
    KnownDeviceModel.deleteOne({ _id: alert.knownDeviceId }),
  ]);

  await auditLog(
    {
      action: 'UNRECOGNIZED_LOGIN_REPORTED',
      userId,
      clinicId: user?.clinicId ? String(user.clinicId) : undefined,
      metadata: { reasons: alert.reasons, deviceLabel: alert.deviceLabel, country: alert.country },
    },
    req
  );
  return { userId };
}

export async function listKnownDevices(userId: string) {
  return KnownDeviceModel.find({ userId: new Types.ObjectId(userId) })
    .sort({ lastSeenAt: -1 })
    .lean();
}
