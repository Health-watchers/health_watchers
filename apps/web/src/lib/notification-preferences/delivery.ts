import { FREQUENCY_LABELS, channelDefinition, typeDefinition } from './preferences';
import type {
  DeliveryResult,
  NotificationChannel,
  NotificationPreferences,
  NotificationTypeKey,
  QuietHours,
} from './types';

/** Parses `HH:mm` into minutes past midnight, or `null` when invalid. */
export function parseTimeOfDay(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesOfDay(at: Date): number {
  return at.getHours() * 60 + at.getMinutes();
}

/**
 * Quiet hours are interpreted in the user's local timezone and may wrap past
 * midnight (for example 22:00–07:00). An invalid or zero-length window is
 * treated as "no quiet hours" rather than blocking notifications by accident.
 */
export function isWithinQuietHours(quiet: QuietHours, at: Date): boolean {
  if (!quiet.enabled) return false;

  const start = parseTimeOfDay(quiet.start);
  const end = parseTimeOfDay(quiet.end);
  if (start === null || end === null || start === end) return false;

  const now = minutesOfDay(at);
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export function describeQuietHours(quiet: QuietHours): string {
  if (!quiet.enabled) return 'Quiet hours are off';
  return `${quiet.start}–${quiet.end} (${quiet.timezone})`;
}

/**
 * Issue #1315 — the single source of truth for "are all preferences respected?".
 * The preview, tester and (future) delivery worker all call this function so a
 * preference cannot be honoured in one place and ignored in another.
 */
export function effectiveDelivery(
  preferences: NotificationPreferences,
  type: NotificationTypeKey,
  channel: NotificationChannel,
  at: Date = new Date()
): DeliveryResult {
  const typeInfo = typeDefinition(type);
  const channelInfo = channelDefinition(channel);

  if (preferences.unsubscribeAll) {
    return { decision: 'suppressed', reason: 'You have unsubscribed from all notifications.' };
  }

  if (!preferences.types[type]) {
    return {
      decision: 'suppressed',
      reason: `${typeInfo.label} notifications are switched off.`,
    };
  }

  if (!preferences.channels[channel]) {
    return {
      decision: 'suppressed',
      reason: `${channelInfo.label} is switched off for notifications.`,
    };
  }

  if (isWithinQuietHours(preferences.quietHours, at)) {
    if (typeInfo.critical && preferences.quietHours.allowCriticalOverride) {
      return {
        decision: 'delivered',
        reason: 'Delivered now — safety-critical notifications break through quiet hours.',
      };
    }
    return {
      decision: 'held_for_digest',
      reason: 'Held until the next digest because quiet hours are active.',
    };
  }

  if (preferences.frequency === 'immediate') {
    return { decision: 'delivered', reason: 'Delivered immediately.' };
  }

  return {
    decision: 'held_for_digest',
    reason: `Batched into the ${FREQUENCY_LABELS[
      preferences.frequency
    ].toLowerCase()} at ${preferences.digestTime}.`,
  };
}
