'use client';

import { Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';
import {
  FREQUENCY_DESCRIPTIONS,
  FREQUENCY_LABELS,
  setDigestTime,
  setFrequency,
} from '@/lib/notification-preferences/preferences';
import type { NotificationFrequency, NotificationPreferences } from '@/lib/notification-preferences/types';

const FREQUENCIES: NotificationFrequency[] = ['immediate', 'daily_digest', 'weekly_digest'];

export interface FrequencyControlsProps {
  preferences: NotificationPreferences;
  onChange: (preferences: NotificationPreferences) => void;
}

/** Issue #1315 — notification frequency controls. */
export function FrequencyControls({ preferences, onChange }: FrequencyControlsProps) {
  const isDigest = preferences.frequency !== 'immediate';

  return (
    <Card>
      <CardHeader>
        <CardTitle>How often we contact you</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Frequency
          </legend>
          {FREQUENCIES.map((frequency) => {
            const inputId = `notify-frequency-${frequency}`;
            return (
              <label
                key={frequency}
                htmlFor={inputId}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-700"
              >
                <input
                  id={inputId}
                  type="radio"
                  name="notification-frequency"
                  className="mt-0.5 h-4 w-4 border-neutral-300"
                  checked={preferences.frequency === frequency}
                  onChange={() => onChange(setFrequency(preferences, frequency))}
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-100">
                    {FREQUENCY_LABELS[frequency]}
                  </span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                    {FREQUENCY_DESCRIPTIONS[frequency]}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="max-w-xs">
          <Input
            label="Digest delivery time"
            type="time"
            value={preferences.digestTime}
            disabled={!isDigest}
            helperText={
              isDigest
                ? 'Applied to the selected digest.'
                : 'Only used when a digest frequency is selected.'
            }
            onChange={(event) => onChange(setDigestTime(preferences, event.target.value))}
          />
        </div>
      </CardContent>
    </Card>
  );
}
