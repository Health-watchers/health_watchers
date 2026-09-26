import { createDefaultPreferences } from './preferences';
import type {
  NotificationChannel,
  NotificationContent,
  NotificationFrequency,
  NotificationPreferences,
  NotificationTypeKey,
} from './types';

/**
 * Issue #1315 — settings persistence.
 * Preferences are stored in local storage so they survive a reload. Every value
 * read back is re-validated, so a stale or hand-edited payload can never put the
 * UI into an invalid state.
 */

export const PREFERENCES_STORAGE_KEY = 'healthwatchers.notification-preferences.v1';

const FREQUENCIES: NotificationFrequency[] = ['immediate', 'daily_digest', 'weekly_digest'];
const CONTENT_LEVELS: NotificationContent[] = ['full_details', 'summary_only', 'minimal'];
const CHANNELS: NotificationChannel[] = ['email', 'push', 'sms', 'in_app'];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function isTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Merges an untrusted payload over the defaults, discarding anything invalid. */
export function sanitisePreferences(candidate: unknown): NotificationPreferences {
  const defaults = createDefaultPreferences();
  const record = asRecord(candidate);
  if (!record) return defaults;

  const types = { ...defaults.types };
  const typeValues = asRecord(record.types);
  if (typeValues) {
    for (const [key, value] of Object.entries(typeValues)) {
      if (key in types && typeof value === 'boolean') {
        types[key as NotificationTypeKey] = value;
      }
    }
  }

  const channels = { ...defaults.channels };
  const channelValues = asRecord(record.channels);
  if (channelValues) {
    for (const channel of CHANNELS) {
      const value = channelValues[channel];
      if (typeof value === 'boolean') channels[channel] = value;
    }
  }

  const quietValues = asRecord(record.quietHours);

  const frequency = FREQUENCIES.includes(record.frequency as NotificationFrequency)
    ? (record.frequency as NotificationFrequency)
    : defaults.frequency;
  const content = CONTENT_LEVELS.includes(record.content as NotificationContent)
    ? (record.content as NotificationContent)
    : defaults.content;

  return {
    types,
    channels,
    frequency,
    content,
    quietHours: {
      enabled:
        quietValues && typeof quietValues.enabled === 'boolean'
          ? quietValues.enabled
          : defaults.quietHours.enabled,
      start: quietValues && isTimeOfDay(quietValues.start) ? quietValues.start : defaults.quietHours.start,
      end: quietValues && isTimeOfDay(quietValues.end) ? quietValues.end : defaults.quietHours.end,
      timezone:
        quietValues && typeof quietValues.timezone === 'string'
          ? quietValues.timezone
          : defaults.quietHours.timezone,
      allowCriticalOverride:
        quietValues && typeof quietValues.allowCriticalOverride === 'boolean'
          ? quietValues.allowCriticalOverride
          : defaults.quietHours.allowCriticalOverride,
    },
    digestTime: isTimeOfDay(record.digestTime) ? record.digestTime : defaults.digestTime,
    unsubscribeAll:
      typeof record.unsubscribeAll === 'boolean' ? record.unsubscribeAll : defaults.unsubscribeAll,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : defaults.updatedAt,
  };
}

/** Reads stored preferences, or `null` when nothing valid is stored. */
export function loadPreferences(): NotificationPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    return sanitisePreferences(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function savePreferences(preferences: NotificationPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable (private mode, quota) — preferences still work
    // for the current session, so failing silently here is intentional.
  }
}

export function clearStoredPreferences(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
