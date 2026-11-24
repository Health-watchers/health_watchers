import type {
  ChannelDefinition,
  NotificationChannel,
  NotificationContent,
  NotificationFrequency,
  NotificationPreferences,
  NotificationTypeDefinition,
  NotificationTypeKey,
  QuietHours,
  QuietHoursDraft,
} from './types';

/** Issue #1315 — notification type selection. */
export const NOTIFICATION_TYPES: NotificationTypeDefinition[] = [
  {
    key: 'referral_updates',
    label: 'Referral updates',
    description: 'New referrals, acceptances and rejections.',
    critical: false,
    defaultEnabled: true,
  },
  {
    key: 'appointment_reminders',
    label: 'Appointment reminders',
    description: 'Upcoming and cancelled appointments.',
    critical: false,
    defaultEnabled: true,
  },
  {
    key: 'lab_results',
    label: 'Lab results',
    description: 'Results released by the laboratory.',
    critical: true,
    defaultEnabled: true,
  },
  {
    key: 'prescription_alerts',
    label: 'Prescription alerts',
    description: 'Refill requests, interactions and formulary changes.',
    critical: true,
    defaultEnabled: true,
  },
  {
    key: 'payment_updates',
    label: 'Payment updates',
    description: 'Payments received, failed and refunded.',
    critical: false,
    defaultEnabled: true,
  },
  {
    key: 'care_team_messages',
    label: 'Care team messages',
    description: 'Direct messages from colleagues on the care team.',
    critical: false,
    defaultEnabled: true,
  },
  {
    key: 'system_updates',
    label: 'System updates',
    description: 'Maintenance windows and release notes.',
    critical: false,
    defaultEnabled: false,
  },
  {
    key: 'security_alerts',
    label: 'Security alerts',
    description: 'New sign-ins, MFA changes and access grants.',
    critical: true,
    defaultEnabled: true,
  },
];

/** Issue #1315 — channel preference settings. */
export const NOTIFICATION_CHANNELS: ChannelDefinition[] = [
  { value: 'email', label: 'Email', description: 'Sent to your registered email address.' },
  { value: 'push', label: 'Push', description: 'Web and mobile push notifications.' },
  { value: 'sms', label: 'SMS', description: 'Text messages to your verified number.' },
  { value: 'in_app', label: 'In-app', description: 'Bell icon and notification centre.' },
];

export const FREQUENCY_LABELS: Record<NotificationFrequency, string> = {
  immediate: 'Immediate',
  daily_digest: 'Daily digest',
  weekly_digest: 'Weekly digest',
};

export const FREQUENCY_DESCRIPTIONS: Record<NotificationFrequency, string> = {
  immediate: 'Send each notification as soon as it happens.',
  daily_digest: 'Bundle notifications into one summary each morning.',
  weekly_digest: 'Bundle notifications into one summary each Monday.',
};

export const CONTENT_LABELS: Record<NotificationContent, string> = {
  full_details: 'Full details',
  summary_only: 'Summary only',
  minimal: 'Minimal',
};

export const CONTENT_DESCRIPTIONS: Record<NotificationContent, string> = {
  full_details: 'Include clinical context, values and recommended actions.',
  summary_only: 'Include the headline and a one-line summary only.',
  minimal: 'Include just the fact that something happened.',
};

const TYPE_INDEX = new Map<NotificationTypeKey, NotificationTypeDefinition>(
  NOTIFICATION_TYPES.map((definition) => [definition.key, definition])
);

const CHANNEL_INDEX = new Map<NotificationChannel, ChannelDefinition>(
  NOTIFICATION_CHANNELS.map((definition) => [definition.value, definition])
);

export function typeDefinition(key: NotificationTypeKey): NotificationTypeDefinition {
  const definition = TYPE_INDEX.get(key);
  if (!definition) throw new Error(`Unknown notification type: ${key}`);
  return definition;
}

export function channelDefinition(channel: NotificationChannel): ChannelDefinition {
  const definition = CHANNEL_INDEX.get(channel);
  if (!definition) throw new Error(`Unknown notification channel: ${channel}`);
  return definition;
}

/** A fresh preferences object — never mutate the shared defaults. */
export function createDefaultPreferences(): NotificationPreferences {
  const types = {} as Record<NotificationTypeKey, boolean>;
  for (const item of NOTIFICATION_TYPES) types[item.key] = item.defaultEnabled;

  const channels = {} as Record<NotificationChannel, boolean>;
  for (const item of NOTIFICATION_CHANNELS) channels[item.value] = item.value !== 'sms';

  return {
    types,
    channels,
    frequency: 'immediate',
    content: 'full_details',
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
      timezone: 'Local time',
      allowCriticalOverride: true,
    },
    digestTime: '09:00',
    unsubscribeAll: false,
    updatedAt: new Date().toISOString(),
  };
}

export function setTypeEnabled(
  preferences: NotificationPreferences,
  key: NotificationTypeKey,
  enabled: boolean
): NotificationPreferences {
  return { ...preferences, types: { ...preferences.types, [key]: enabled } };
}

export function setChannelEnabled(
  preferences: NotificationPreferences,
  channel: NotificationChannel,
  enabled: boolean
): NotificationPreferences {
  return { ...preferences, channels: { ...preferences.channels, [channel]: enabled } };
}

export function setFrequency(
  preferences: NotificationPreferences,
  frequency: NotificationFrequency
): NotificationPreferences {
  return { ...preferences, frequency };
}

export function setContent(
  preferences: NotificationPreferences,
  content: NotificationContent
): NotificationPreferences {
  return { ...preferences, content };
}

export function setDigestTime(
  preferences: NotificationPreferences,
  digestTime: string
): NotificationPreferences {
  return { ...preferences, digestTime };
}

export function setUnsubscribeAll(
  preferences: NotificationPreferences,
  unsubscribeAll: boolean
): NotificationPreferences {
  return { ...preferences, unsubscribeAll };
}

/** Applies the quiet-hours editor while keeping the stored timezone. */
export function setQuietHours(
  preferences: NotificationPreferences,
  draft: QuietHoursDraft
): NotificationPreferences {
  const quietHours: QuietHours = {
    enabled: draft.enabled,
    start: draft.start,
    end: draft.end,
    timezone: preferences.quietHours.timezone,
    allowCriticalOverride: draft.criticalOverride,
  };
  return { ...preferences, quietHours };
}

export function countEnabledTypes(preferences: NotificationPreferences): number {
  return Object.values(preferences.types).filter(Boolean).length;
}

export function countEnabledChannels(preferences: NotificationPreferences): number {
  return Object.values(preferences.channels).filter(Boolean).length;
}

/** Local timezone label used in the quiet-hours editor. */
export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
  } catch {
    return 'Local time';
  }
}

