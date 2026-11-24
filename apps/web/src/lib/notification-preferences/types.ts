/**
 * Issue #1315 — notification preferences domain types.
 * Optional data is modelled as `T | null` so these types satisfy the monorepo
 * `exactOptionalPropertyTypes` setting.
 */

export type NotificationTypeKey =
  | 'referral_updates'
  | 'appointment_reminders'
  | 'lab_results'
  | 'prescription_alerts'
  | 'payment_updates'
  | 'care_team_messages'
  | 'system_updates'
  | 'security_alerts';

export type NotificationChannel = 'email' | 'push' | 'sms' | 'in_app';

export type NotificationFrequency = 'immediate' | 'daily_digest' | 'weekly_digest';

export type NotificationContent = 'full_details' | 'summary_only' | 'minimal';

export type DeliveryDecision = 'delivered' | 'held_for_digest' | 'suppressed';

export interface NotificationTypeDefinition {
  key: NotificationTypeKey;
  label: string;
  description: string;
  /** Safety-critical types are still delivered during quiet hours. */
  critical: boolean;
  defaultEnabled: boolean;
}

export interface ChannelDefinition {
  value: NotificationChannel;
  label: string;
  description: string;
}

export interface QuietHours {
  enabled: boolean;
  /** `HH:mm` in 24-hour time. */
  start: string;
  end: string;
  timezone: string;
  /** Allow safety-critical notifications to break through quiet hours. */
  allowCriticalOverride: boolean;
}

export interface NotificationPreferences {
  types: Record<NotificationTypeKey, boolean>;
  channels: Record<NotificationChannel, boolean>;
  frequency: NotificationFrequency;
  content: NotificationContent;
  quietHours: QuietHours;
  /** `HH:mm` delivery time for digest frequencies. */
  digestTime: string;
  unsubscribeAll: boolean;
  updatedAt: string;
}

export interface NotificationTemplate {
  key: string;
  type: NotificationTypeKey;
  channel: NotificationChannel;
  subject: string;
  body: string;
}

export interface NotificationHistoryEntry {
  id: string;
  at: string;
  type: NotificationTypeKey;
  channel: NotificationChannel;
  subject: string;
  preview: string;
  read: boolean;
}

export interface DeliveryResult {
  decision: DeliveryDecision;
  /** Human-readable explanation shown in the preview and tester. */
  reason: string;
}

export interface RenderedNotification {
  subject: string;
  body: string;
}

export interface QuietHoursDraft {
  enabled: boolean;
  start: string;
  end: string;
  criticalOverride: boolean;
}
