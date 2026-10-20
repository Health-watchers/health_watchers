'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { NOTIFICATION_TYPES, setUnsubscribeAll } from '@/lib/notification-preferences/preferences';
import type { NotificationPreferences, NotificationTypeKey } from '@/lib/notification-preferences/types';

export interface UnsubscribeManagementProps {
  preferences: NotificationPreferences;
  onChange: (preferences: NotificationPreferences) => void;
}

/** Issue #1315 — unsubscribe management. */
export function UnsubscribeManagement({ preferences, onChange }: UnsubscribeManagementProps) {
  const enabled = NOTIFICATION_TYPES.filter((definition) => preferences.types[definition.key]);
  const criticalEnabled = enabled.filter((definition) => definition.critical);

  const toggleType = (key: NotificationTypeKey, value: boolean) => {
    onChange({
      ...preferences,
      types: { ...preferences.types, [key]: value },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unsubscribe</CardTitle>
        <Badge variant={preferences.unsubscribeAll ? 'danger' : 'success'}>
          {preferences.unsubscribeAll ? 'All notifications off' : 'Subscribed'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-danger-200 bg-danger-50 rounded-md border p-3 dark:border-danger-800 dark:bg-danger-900/20">
          <label className="flex items-start gap-2 text-sm text-neutral-800 dark:text-neutral-100">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-neutral-300"
              checked={preferences.unsubscribeAll}
              onChange={(event) =>
                onChange(setUnsubscribeAll(preferences, event.target.checked))
              }
            />
            <span>
              <span className="block font-semibold">Unsubscribe from everything</span>
              <span className="block text-xs">
                Pauses every notification, including safety-critical alerts, until you turn it back
                on. Transactional messages about your account are still sent.
              </span>
            </span>
          </label>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            Opt out of individual categories
          </h3>
          <ul className="mt-2 space-y-1">
            {NOTIFICATION_TYPES.map((definition) => {
              const inputId = `unsubscribe-${definition.key}`;
              return (
                <li key={definition.key} className="flex items-center gap-2">
                  <input
                    id={inputId}
                    type="checkbox"
                    className="h-4 w-4 rounded border-neutral-300"
                    checked={preferences.types[definition.key]}
                    disabled={preferences.unsubscribeAll}
                    onChange={(event) => toggleType(definition.key, event.target.checked)}
                  />
                  <label
                    htmlFor={inputId}
                    className="text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    {definition.label}
                    {definition.critical && (
                      <span className="text-warning-700 dark:text-warning-300">
                        {' '}
                        (safety-critical)
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
          You are currently subscribed to {enabled.length} of {NOTIFICATION_TYPES.length} categories
          {criticalEnabled.length > 0 && `, including ${criticalEnabled.length} safety-critical`}.
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({
                ...preferences,
                types: NOTIFICATION_TYPES.reduce<
                  Record<NotificationTypeKey, boolean>
                >((accumulator, definition) => {
                  accumulator[definition.key] = true;
                  return accumulator;
                }, {} as Record<NotificationTypeKey, boolean>),
                unsubscribeAll: false,
              })
            }
          >
            Subscribe to everything
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
