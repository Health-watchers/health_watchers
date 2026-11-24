'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import {
  CONTENT_DESCRIPTIONS,
  CONTENT_LABELS,
  setContent,
} from '@/lib/notification-preferences/preferences';
import type {
  NotificationContent,
  NotificationPreferences,
} from '@/lib/notification-preferences/types';

const CONTENT_LEVELS: NotificationContent[] = ['full_details', 'summary_only', 'minimal'];

export interface ContentPreferencesProps {
  preferences: NotificationPreferences;
  onChange: (preferences: NotificationPreferences) => void;
}

/** Issue #1315 — notification content preferences. */
export function ContentPreferences({ preferences, onChange }: ContentPreferencesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>How much detail we include</CardTitle>
      </CardHeader>
      <CardContent>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Content level
          </legend>
          {CONTENT_LEVELS.map((level) => {
            const inputId = `notify-content-${level}`;
            return (
              <label
                key={level}
                htmlFor={inputId}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-700"
              >
                <input
                  id={inputId}
                  type="radio"
                  name="notification-content"
                  className="mt-0.5 h-4 w-4 border-neutral-300"
                  checked={preferences.content === level}
                  onChange={() => onChange(setContent(preferences, level))}
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-100">
                    {CONTENT_LABELS[level]}
                  </span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                    {CONTENT_DESCRIPTIONS[level]}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          Notifications containing patient identifiers always include the minimum needed to
          identify the record.
        </p>
      </CardContent>
    </Card>
  );
}
