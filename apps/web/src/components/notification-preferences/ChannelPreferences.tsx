'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import {
  NOTIFICATION_CHANNELS,
  countEnabledChannels,
} from '@/lib/notification-preferences/preferences';
import type { NotificationChannel, NotificationPreferences } from '@/lib/notification-preferences/types';

export interface ChannelPreferencesProps {
  preferences: NotificationPreferences;
  onChange: (preferences: NotificationPreferences) => void;
}

/** Issue #1315 — channel preference settings. */
export function ChannelPreferences({ preferences, onChange }: ChannelPreferencesProps) {
  const enabledCount = countEnabledChannels(preferences);

  const toggle = (channel: NotificationChannel, enabled: boolean) => {
    onChange({
      ...preferences,
      channels: { ...preferences.channels, [channel]: enabled },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>How we contact you</CardTitle>
        <Badge variant={enabledCount === 0 ? 'danger' : 'default'}>
          {enabledCount} of {NOTIFICATION_CHANNELS.length} channels on
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {enabledCount === 0 && (
          <p role="alert" className="text-danger-600 dark:text-danger-400 text-sm">
            At least one channel must stay on, otherwise no notifications can be delivered.
          </p>
        )}
        {NOTIFICATION_CHANNELS.map((channel) => {
          const checked = preferences.channels[channel.value];
          const inputId = `notify-channel-${channel.value}`;
          return (
            <div
              key={channel.value}
              className="flex items-start gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-700"
            >
              <input
                id={inputId}
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-neutral-300"
                checked={checked}
                onChange={(event) => toggle(channel.value, event.target.checked)}
              />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={inputId}
                  className="text-sm font-medium text-neutral-800 dark:text-neutral-100"
                >
                  {channel.label}
                </label>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {channel.description}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
