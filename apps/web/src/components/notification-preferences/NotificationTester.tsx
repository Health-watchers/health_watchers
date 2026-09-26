'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Select } from '@/components/ui';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from '@/lib/notification-preferences/preferences';
import { effectiveDelivery } from '@/lib/notification-preferences/delivery';
import { NOTIFICATION_TEMPLATES, renderTemplate } from '@/lib/notification-preferences/templates';
import type {
  DeliveryResult,
  NotificationChannel,
  NotificationHistoryEntry,
  NotificationPreferences,
  NotificationTypeKey,
} from '@/lib/notification-preferences/types';

const TYPE_OPTIONS = NOTIFICATION_TYPES.map((definition) => ({
  value: definition.key,
  label: definition.label,
}));

const CHANNEL_OPTIONS = NOTIFICATION_CHANNELS.map((channel) => ({
  value: channel.value,
  label: channel.label,
}));

export interface NotificationTesterProps {
  preferences: NotificationPreferences;
  /** Called when a test notification was actually queued or delivered. */
  onSent: (entry: NotificationHistoryEntry) => void;
}

/**
 * Issue #1315 — notification testing.
 * Runs a test through the same delivery rules the real sender uses, so the
 * outcome shown here is the outcome the user would get.
 */
export function NotificationTester({ preferences, onSent }: NotificationTesterProps) {
  const [type, setType] = useState<NotificationTypeKey>('lab_results');
  const [channel, setChannel] = useState<NotificationChannel>('email');
  const [result, setResult] = useState<DeliveryResult | null>(null);

  const handleSend = () => {
    const decision = effectiveDelivery(preferences, type, channel, new Date());
    setResult(decision);
    if (decision.decision === 'suppressed') return;

    const template =
      NOTIFICATION_TEMPLATES.find((item) => item.type === type && item.channel === channel) ??
      NOTIFICATION_TEMPLATES.find((item) => item.type === type) ??
      null;
    const rendered = template ? renderTemplate(template) : null;

    onSent({
      id: `test-${Date.now()}`,
      at: new Date().toISOString(),
      type,
      channel,
      subject: rendered?.subject ?? 'Test notification',
      preview: rendered?.body.split('\n')[0] ?? 'Test notification',
      read: true,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test a notification</CardTitle>
        {result && (
          <Badge
            variant={
              result.decision === 'delivered'
                ? 'success'
                : result.decision === 'held_for_digest'
                  ? 'warning'
                  : 'danger'
            }
          >
            {result.decision.replace(/_/g, ' ')}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Notification type"
            options={TYPE_OPTIONS}
            value={type}
            onChange={(event) => setType(event.target.value as NotificationTypeKey)}
          />
          <Select
            label="Channel"
            options={CHANNEL_OPTIONS}
            value={channel}
            onChange={(event) => setChannel(event.target.value as NotificationChannel)}
          />
        </div>

        <Button onClick={handleSend}>Send test notification</Button>

        {result && (
          <p role="status" className="text-sm text-neutral-700 dark:text-neutral-300">
            {result.reason}
          </p>
        )}

        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Test notifications use your saved preferences, including quiet hours and digest frequency,
          so a suppressed result is the expected outcome when a preference is off.
        </p>
      </CardContent>
    </Card>
  );
}
