'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { NOTIFICATION_TYPES } from '@/lib/notification-preferences/preferences';
import type { NotificationPreferences, NotificationTypeKey } from '@/lib/notification-preferences/types';

export interface NotificationTypeSelectorProps {
  preferences: NotificationPreferences;
  onChange: (preferences: NotificationPreferences) => void;
}

/** Issue #1315 — notification type selection. */
export function NotificationTypeSelector({
  preferences,
  onChange,
}: NotificationTypeSelectorProps) {
  const disabled = preferences.unsubscribeAll;

  const toggle = (key: NotificationTypeKey, enabled: boolean) => {
    onChange({
      ...preferences,
      types: { ...preferences.types, [key]: enabled },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>What you want to hear about</CardTitle>
      </CardHeader>
      <CardContent>
        {disabled && (
          <p role="status" className="text-warning-700 dark:text-warning-300 mb-3 text-sm">
            All notifications are switched off. Turn them back on from the Unsubscribe tab.
          </p>
        )}
        <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2" disabled={disabled}>
          <legend className="sr-only">Notification types</legend>
          {NOTIFICATION_TYPES.map((definition) => {
            const checked = preferences.types[definition.key];
            const inputId = `notify-type-${definition.key}`;
            return (
              <div key={definition.key} className="rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
                <div className="flex items-start gap-2">
                  <input
                    id={inputId}
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-neutral-300"
                    checked={checked}
                    onChange={(event) => toggle(definition.key, event.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={inputId}
                      className="flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-100"
                    >
                      {definition.label}
                      {definition.critical && <Badge variant="warning">Critical</Badge>}
                    </label>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {definition.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </fieldset>
      </CardContent>
    </Card>
  );
}
