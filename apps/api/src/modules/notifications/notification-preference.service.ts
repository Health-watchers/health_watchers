import { Types } from 'mongoose';
import { UserModel } from '../auth/models/user.model';
import {
  NotificationPreferenceModel,
  INotificationPreference,
} from './notification-preference.model';
import { NOTIFICATION_CHANNELS, NotificationChannel } from './notification-template.model';

/**
 * Notification types that are always delivered on every configured channel,
 * bypassing preferences and quiet hours (safety / fraud / clinical risk).
 */
export const CRITICAL_NOTIFICATION_TYPES = new Set<string>([
  'balance_critical',
  'high_risk_patient',
  'unrecognized_transaction',
  'large_transaction',
  'lab_result_ready',
]);

export interface ResolvedChannels {
  channels: NotificationChannel[];
  suppressed: Array<{ channel: NotificationChannel; reason: string }>;
  /** When set, non-critical deliveries should be scheduled for this time (quiet hours). */
  deferUntil?: Date;
}

interface LegacyPrefs {
  inAppNotifications?: boolean;
  emailNotifications?: boolean;
  notificationTypes?: Record<string, boolean>;
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** Current wall-clock minute-of-day in the given IANA timezone. */
function nowMinutesInZone(timezone: string, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone || 'UTC',
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return h * 60 + m;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

export function isWithinQuietHours(
  quietHours: INotificationPreference['quietHours'] | undefined,
  now = new Date()
): boolean {
  if (!quietHours?.enabled) return false;
  const cur = nowMinutesInZone(quietHours.timezone, now);
  const start = minutesOfDay(quietHours.start);
  const end = minutesOfDay(quietHours.end);
  // Overnight window (e.g. 22:00 → 07:00) wraps past midnight.
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
}

function quietHoursEnd(
  quietHours: NonNullable<INotificationPreference['quietHours']>,
  now: Date
): Date {
  const cur = nowMinutesInZone(quietHours.timezone, now);
  const end = minutesOfDay(quietHours.end);
  let deltaMin = end - cur;
  if (deltaMin <= 0) deltaMin += 24 * 60;
  return new Date(now.getTime() + deltaMin * 60_000);
}

function toggleFor(
  pref: INotificationPreference,
  type: string
): Record<NotificationChannel, boolean> {
  const base = pref.channels as unknown as Record<NotificationChannel, boolean>;
  const override = pref.typeOverrides?.get?.(type) as
    | Partial<Record<NotificationChannel, boolean>>
    | undefined;
  /* eslint-disable security/detect-object-injection -- `ch` is a fixed enum literal from NOTIFICATION_CHANNELS */
  const result = {} as Record<NotificationChannel, boolean>;
  for (const ch of NOTIFICATION_CHANNELS) {
    result[ch] = override && ch in override ? Boolean(override[ch]) : base[ch] !== false;
  }
  /* eslint-enable security/detect-object-injection */
  return result;
}

export interface ResolveChannelsInput {
  userId: string | Types.ObjectId;
  type: string;
  /** Channels the caller asked for; defaults to every channel. */
  requestedChannels?: NotificationChannel[];
  now?: Date;
}

/**
 * Combine the caller's requested channels with the user's stored preferences,
 * the legacy `user.preferences` flags and quiet hours to produce the final
 * channel list plus an explainable list of suppressed channels.
 */
export async function resolveChannels(input: ResolveChannelsInput): Promise<ResolvedChannels> {
  const requested = input.requestedChannels?.length
    ? input.requestedChannels
    : [...NOTIFICATION_CHANNELS];
  const now = input.now ?? new Date();
  const isCritical = CRITICAL_NOTIFICATION_TYPES.has(input.type);

  const [pref, user] = await Promise.all([
    NotificationPreferenceModel.findOne({ userId: input.userId }).lean<INotificationPreference>(),
    UserModel.findById(input.userId).lean<{ preferences?: LegacyPrefs }>(),
  ]);

  const suppressed: ResolvedChannels['suppressed'] = [];
  const legacy = user?.preferences ?? {};
  const legacyTypeEnabled = legacy.notificationTypes?.[input.type];

  if (!isCritical && pref && pref.enabled === false) {
    return {
      channels: [],
      suppressed: requested.map((channel) => ({ channel, reason: 'notifications_disabled' })),
    };
  }
  if (!isCritical && legacyTypeEnabled === false) {
    return {
      channels: [],
      suppressed: requested.map((channel) => ({ channel, reason: 'type_disabled' })),
    };
  }

  const toggles = pref ? toggleFor(pref, input.type) : null;
  const quiet = !isCritical && isWithinQuietHours(pref?.quietHours, now);
  const deferUntil = quiet && pref?.quietHours ? quietHoursEnd(pref.quietHours, now) : undefined;

  const channels: NotificationChannel[] = [];
  for (const channel of requested) {
    // eslint-disable-next-line security/detect-object-injection -- `channel` is a NotificationChannel enum literal
    if (!isCritical && toggles && toggles[channel] === false) {
      suppressed.push({ channel, reason: 'channel_disabled' });
      continue;
    }
    if (!isCritical && channel === 'in_app' && legacy.inAppNotifications === false) {
      suppressed.push({ channel, reason: 'in_app_disabled' });
      continue;
    }
    if (!isCritical && channel === 'email' && legacy.emailNotifications === false) {
      suppressed.push({ channel, reason: 'email_disabled' });
      continue;
    }
    channels.push(channel);
  }

  return { channels, suppressed, ...(deferUntil ? { deferUntil } : {}) };
}

// ── CRUD ────────────────────────────────────────────────────────────────────
export async function getPreferences(
  userId: string | Types.ObjectId,
  clinicId: string | Types.ObjectId
): Promise<INotificationPreference> {
  const existing = await NotificationPreferenceModel.findOne({
    userId,
  }).lean<INotificationPreference>();
  if (existing) return existing;
  return NotificationPreferenceModel.create({ userId, clinicId });
}

export interface UpdatePreferencesInput {
  enabled?: boolean;
  channels?: Partial<Record<NotificationChannel, boolean>>;
  typeOverrides?: Record<string, Partial<Record<NotificationChannel, boolean>>>;
  quietHours?: Partial<INotificationPreference['quietHours']>;
  digest?: Partial<INotificationPreference['digest']>;
}

export async function updatePreferences(
  userId: string | Types.ObjectId,
  clinicId: string | Types.ObjectId,
  patch: UpdatePreferencesInput
): Promise<INotificationPreference> {
  const pref =
    (await NotificationPreferenceModel.findOne({ userId })) ??
    new NotificationPreferenceModel({ userId, clinicId });

  if (patch.enabled !== undefined) pref.enabled = patch.enabled;
  if (patch.channels) {
    for (const ch of NOTIFICATION_CHANNELS) {
      if (ch in patch.channels) {
        // eslint-disable-next-line security/detect-object-injection -- `ch` is a fixed enum literal
        (pref.channels as unknown as Record<string, boolean>)[ch] = Boolean(patch.channels[ch]);
      }
    }
  }
  if (patch.typeOverrides) {
    pref.typeOverrides = pref.typeOverrides ?? new Map();
    for (const [type, toggle] of Object.entries(patch.typeOverrides)) {
      pref.typeOverrides.set(type, toggle);
    }
  }
  if (patch.quietHours) Object.assign(pref.quietHours, patch.quietHours);
  if (patch.digest) Object.assign(pref.digest, patch.digest);

  await pref.save();
  return pref.toObject();
}
