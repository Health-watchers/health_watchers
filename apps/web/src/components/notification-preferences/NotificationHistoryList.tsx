'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Select } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { channelDefinition, typeDefinition } from '@/lib/notification-preferences/preferences';
import { historyForChannel, historyForType } from '@/lib/notification-preferences/sampleData';
import type {
  NotificationChannel,
  NotificationHistoryEntry,
  NotificationTypeKey,
} from '@/lib/notification-preferences/types';

const CHANNEL_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All channels' },
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push' },
  { value: 'sms', label: 'SMS' },
  { value: 'in_app', label: 'In-app' },
];

export interface NotificationHistoryListProps {
  entries: readonly NotificationHistoryEntry[];
  onMarkRead: (entryId: string) => void;
  onMarkAllRead: () => void;
}

/** Issue #1315 — notification history. */
export function NotificationHistoryList({
  entries,
  onMarkRead,
  onMarkAllRead,
}: NotificationHistoryListProps) {
  const [channelFilter, setChannelFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const typeFilters = useMemo(() => {
    const keys = new Set<NotificationTypeKey>();
    for (const entry of entries) keys.add(entry.type);
    return [
      { value: 'all', label: 'All types' },
      ...Array.from(keys, (key) => ({ value: key, label: typeDefinition(key).label })),
    ];
  }, [entries]);

  const visible = useMemo(
    () =>
      historyForType(
        historyForChannel(entries, channelFilter as NotificationChannel | 'all'),
        typeFilter as NotificationTypeKey | 'all'
      ).filter((entry) => !unreadOnly || !entry.read),
    [entries, channelFilter, typeFilter, unreadOnly]
  );

  const unread = entries.filter((entry) => !entry.read).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification history</CardTitle>
        <Button size="sm" variant="outline" onClick={onMarkAllRead} disabled={unread === 0}>
          Mark all as read
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Channel"
            options={CHANNEL_FILTERS}
            value={channelFilter}
            onChange={(event) => setChannelFilter(event.target.value)}
          />
          <Select
            label="Type"
            options={typeFilters}
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-300"
              checked={unreadOnly}
              onChange={(event) => setUnreadOnly(event.target.checked)}
            />
            Unread only
          </label>
          <p role="status" className="text-sm text-neutral-500 dark:text-neutral-400">
            {unread} unread · {visible.length} shown
          </p>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title="No notifications to show"
            description="Change the filters, or send a test notification from the Test tab."
          />
        ) : (
          <ul className="space-y-2">
            {visible.map((entry) => (
              <li
                key={entry.id}
                className={[
                  'rounded-md border p-3',
                  entry.read
                    ? 'border-neutral-200 dark:border-neutral-700'
                    : 'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {entry.subject}
                  </span>
                  <Badge variant="default">
                    {channelDefinition(entry.channel).label}
                  </Badge>
                  {!entry.read && <Badge variant="primary">Unread</Badge>}
                </div>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  {entry.preview}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                  <span>{typeDefinition(entry.type).label}</span>
                  <span>{formatDateTime(entry.at)}</span>
                  {!entry.read && (
                    <button
                      type="button"
                      onClick={() => onMarkRead(entry.id)}
                      className="text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      Mark as read
                    </button>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
