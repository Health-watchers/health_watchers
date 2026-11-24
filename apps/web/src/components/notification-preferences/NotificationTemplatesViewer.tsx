'use client';

import { useMemo, useState } from 'react';
import { Badge, Card, CardContent, CardHeader, CardTitle, Select } from '@/components/ui';
import { channelDefinition, typeDefinition } from '@/lib/notification-preferences/preferences';
import { NOTIFICATION_TEMPLATES } from '@/lib/notification-preferences/templates';
import type { NotificationChannel } from '@/lib/notification-preferences/types';

const CHANNEL_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All channels' },
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push' },
  { value: 'sms', label: 'SMS' },
  { value: 'in_app', label: 'In-app' },
];

/** Issue #1315 — notification templates viewer. */
export function NotificationTemplatesViewer() {
  const [channelFilter, setChannelFilter] = useState('all');

  const templates = useMemo(
    () =>
      channelFilter === 'all'
        ? NOTIFICATION_TEMPLATES
        : NOTIFICATION_TEMPLATES.filter((template) => template.channel === channelFilter),
    [channelFilter]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Templates</CardTitle>
        <div className="w-48">
          <Select
            label="Channel"
            options={CHANNEL_FILTERS}
            value={channelFilter}
            onChange={(event) => setChannelFilter(event.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No templates are configured for this channel yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {templates.map((template) => (
              <li
                key={template.key}
                className="rounded-md border border-neutral-200 p-3 dark:border-neutral-700"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {typeDefinition(template.type).label}
                  </span>
                  <Badge variant="default">
                    {channelDefinition(template.channel as NotificationChannel).label}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                  {template.subject}
                </p>
                <details className="mt-1">
                  <summary className="text-primary-600 dark:text-primary-400 cursor-pointer text-xs">
                    View template body
                  </summary>
                  <pre className="bg-neutral-50 dark:bg-neutral-800 mt-2 overflow-x-auto rounded p-2 text-xs whitespace-pre-wrap">
                    {template.body}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          Placeholders in double braces are replaced with patient data at send time.
        </p>
      </CardContent>
    </Card>
  );
}
