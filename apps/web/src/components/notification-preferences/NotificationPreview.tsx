'use client';

import { useMemo } from 'react';
import { Badge, Card, CardContent, CardHeader, CardTitle, Select } from '@/components/ui';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  typeDefinition,
} from '@/lib/notification-preferences/preferences';
import { effectiveDelivery } from '@/lib/notification-preferences/delivery';
import {
  NOTIFICATION_TEMPLATES,
  applyContentLevel,
  renderTemplate,
} from '@/lib/notification-preferences/templates';
import type {
  DeliveryDecision,
  NotificationChannel,
  NotificationPreferences,
  NotificationTypeKey,
} from '@/lib/notification-preferences/types';

const DECISION_LABELS: Record<DeliveryDecision, string> = {
  delivered: 'Delivered now',
  held_for_digest: 'Held for digest',
  suppressed: 'Suppressed',
};

const DECISION_VARIANTS: Record<DeliveryDecision, 'success' | 'warning' | 'danger'> = {
  delivered: 'success',
  held_for_digest: 'warning',
  suppressed: 'danger',
};

const TYPE_OPTIONS = NOTIFICATION_TYPES.map((definition) => ({
  value: definition.key,
  label: definition.label,
}));

const CHANNEL_OPTIONS = NOTIFICATION_CHANNELS.map((channel) => ({
  value: channel.value,
  label: channel.label,
}));

export interface NotificationPreviewProps {
  preferences: NotificationPreferences;
  type: NotificationTypeKey;
  channel: NotificationChannel;
  onTypeChange: (type: NotificationTypeKey) => void;
  onChannelChange: (channel: NotificationChannel) => void;
}

/**
 * Issue #1315 — notification preview.
 * Shows the rendered message exactly as it would be sent, together with the
 * delivery decision the current preferences produce.
 */
export function NotificationPreview({
  preferences,
  type,
  channel,
  onTypeChange,
  onChannelChange,
}: NotificationPreviewProps) {
  const now = useMemo(() => new Date(), []);

  const template =
    NOTIFICATION_TEMPLATES.find((item) => item.type === type && item.channel === channel) ??
    NOTIFICATION_TEMPLATES.find((item) => item.type === type) ??
    null;
  const rendered = template ? renderTemplate(template) : null;
  const body = rendered ? applyContentLevel(rendered.body, preferences.content) : '';
  const delivery = effectiveDelivery(preferences, type, channel, now);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <Badge variant={DECISION_VARIANTS[delivery.decision]}>
          {DECISION_LABELS[delivery.decision]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Notification type"
            options={TYPE_OPTIONS}
            value={type}
            onChange={(event) => onTypeChange(event.target.value as NotificationTypeKey)}
          />
          <Select
            label="Channel"
            options={CHANNEL_OPTIONS}
            value={channel}
            onChange={(event) => onChannelChange(event.target.value as NotificationChannel)}
          />
        </div>

        <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
          {delivery.reason} Type: {typeDefinition(type).label}.
        </p>

        {rendered ? (
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {channel.toUpperCase()} · {preferences.content.replace(/_/g, ' ')}
            </p>
            <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {rendered.subject}
            </p>
            <p className="mt-2 whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">
              {body}
            </p>
          </div>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No template is configured for this notification type yet.
          </p>
        )}

        {template && template.channel !== channel && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            No {channel} template exists for this type, so the nearest template is shown.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
