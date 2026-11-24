'use client';

import { Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';
import { setQuietHours } from '@/lib/notification-preferences/preferences';
import { describeQuietHours, isWithinQuietHours } from '@/lib/notification-preferences/delivery';
import type { NotificationPreferences, QuietHoursDraft } from '@/lib/notification-preferences/types';

export interface QuietHoursScheduleProps {
  preferences: NotificationPreferences;
  onChange: (preferences: NotificationPreferences) => void;
}

/** Issue #1315 — quiet hours scheduling. */
export function QuietHoursSchedule({ preferences, onChange }: QuietHoursScheduleProps) {
  const quiet = preferences.quietHours;

  const update = (patch: Partial<QuietHoursDraft>) => {
    const draft: QuietHoursDraft = {
      enabled: quiet.enabled,
      start: quiet.start,
      end: quiet.end,
      criticalOverride: quiet.allowCriticalOverride,
      ...patch,
    };
    onChange(setQuietHours(preferences, draft));
  };

  const activeNow = isWithinQuietHours(quiet, new Date());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quiet hours</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-neutral-300"
            checked={quiet.enabled}
            onChange={(event) => update({ enabled: event.target.checked })}
          />
          Hold non-critical notifications during quiet hours
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Quiet hours start"
            type="time"
            value={quiet.start}
            disabled={!quiet.enabled}
            onChange={(event) => update({ start: event.target.value })}
          />
          <Input
            label="Quiet hours end"
            type="time"
            value={quiet.end}
            disabled={!quiet.enabled}
            onChange={(event) => update({ end: event.target.value })}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-neutral-300"
            checked={quiet.allowCriticalOverride}
            disabled={!quiet.enabled}
            onChange={(event) => update({ criticalOverride: event.target.checked })}
          />
          Always deliver safety-critical notifications (lab results, prescription alerts,
          security alerts)
        </label>

        <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
          {describeQuietHours(quiet)}
          {quiet.enabled && (
            <span className={activeNow ? 'text-warning-700 dark:text-warning-300' : ''}>
              {activeNow ? ' · currently in quiet hours' : ' · currently outside quiet hours'}
            </span>
          )}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Windows that cross midnight are supported, for example 22:00–07:00. Times are shown in{' '}
          {quiet.timezone.toLowerCase()}.
        </p>
      </CardContent>
    </Card>
  );
}
