'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUnreadCount,
  useNotifications,
  useMarkRead,
  useMarkAllRead,
  usePendingCosignatures,
  TYPE_COLORS,
  TYPE_LABELS,
  type Notification,
} from '@/hooks/useNotifications';
import { queryKeys } from '@/lib/queryKeys';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Single notification item inside the dropdown ─────────────────────────────

function NotificationItem({ n, onRead }: { n: Notification; onRead: (id: string) => void }) {
  const router = useRouter();

  const handleClick = () => {
    if (!n.isRead) onRead(n._id);
    if (n.link) router.push(n.link);
  };

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className={[
          'w-full px-4 py-3 text-left transition-colors',
          'border-b border-neutral-100 last:border-0 dark:border-neutral-700',
          !n.isRead
            ? 'bg-primary-50 hover:bg-primary-100/60 dark:bg-primary-900/25 dark:hover:bg-primary-900/40'
            : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/50',
        ].join(' ')}
      >
        <div className="flex items-start gap-2">
          {/* Unread dot */}
          {!n.isRead ? (
            <span
              className="bg-primary-500 mt-1.5 h-2 w-2 shrink-0 rounded-full"
              aria-hidden="true"
            />
          ) : (
            <span className="mt-1.5 h-2 w-2 shrink-0" aria-hidden="true" />
          )}

          <div className="min-w-0 flex-1">
            {/* Type badge */}
            <span
              className={`mb-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLORS[n.type]}`}
            >
              {TYPE_LABELS[n.type]}
            </span>
            <p className="truncate text-sm leading-snug font-medium text-neutral-900 dark:text-neutral-100">
              {n.title}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
              {n.message}
            </p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              <time dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
            </p>
          </div>
        </div>
      </button>
    </li>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className={[
        'absolute top-0.5 right-0.5 flex h-4 min-w-[1rem] items-center justify-center',
        'rounded-full bg-red-500 px-0.5 text-[10px] leading-none font-bold text-white',
        'ring-2 ring-white dark:ring-neutral-800',
      ].join(' ')}
      aria-hidden="true"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

// ─── NotificationBell ─────────────────────────────────────────────────────────

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: count = 0 } = useUnreadCount();
  const { data } = useNotifications(1, 8);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const { data: cosignData } = usePendingCosignatures();
  const cosignCount: number = (cosignData as { count?: number } | undefined)?.count ?? 0;

  const notifications = data?.data ?? [];

  // ── Real-time: listen for notification:new events dispatched by RealtimeProvider ──
  useEffect(() => {
    const onNewNotification = () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    };
    window.addEventListener('notification:new', onNewNotification);
    return () => window.removeEventListener('notification:new', onNewNotification);
  }, [qc]);

  // ── Close on outside click ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Close on Escape ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const totalBadge = count; // primary badge = unread notifications

  return (
    <div className="relative" ref={ref}>
      {/* ── Bell button ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={[
          'Notifications',
          count > 0 ? `, ${count} unread` : '',
          cosignCount > 0
            ? `, ${cosignCount} pending co-signature${cosignCount !== 1 ? 's' : ''}`
            : '',
        ].join('')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="focus:ring-primary-500 relative rounded-md p-2 text-neutral-500 hover:bg-neutral-100 focus:ring-2 focus:outline-none dark:text-neutral-400 dark:hover:bg-neutral-700"
      >
        {/* Bell icon */}
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread count badge */}
        <Badge count={totalBadge} />

        {/* Co-signature badge (amber, bottom-right) */}
        {cosignCount > 0 && (
          <span
            className="absolute -right-0.5 -bottom-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-0.5 text-[10px] leading-none font-bold text-white ring-2 ring-white dark:ring-neutral-800"
            title={`${cosignCount} pending co-signature${cosignCount !== 1 ? 's' : ''}`}
            aria-hidden="true"
          >
            {cosignCount > 9 ? '9+' : cosignCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications panel"
          aria-modal="false"
          className={[
            'absolute right-0 mt-2 w-80 rounded-lg bg-white shadow-lg',
            'z-50 overflow-hidden border border-neutral-200',
            'dark:border-neutral-700 dark:bg-neutral-800',
          ].join(' ')}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Notifications
              {count > 0 && (
                <span className="bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300 ml-2 rounded-full px-1.5 py-0.5 text-xs font-bold">
                  {count} unread
                </span>
              )}
            </h2>
            {count > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-primary-600 text-xs hover:underline focus:underline focus:outline-none disabled:opacity-50"
              >
                {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <svg
                className="mb-2 h-8 w-8 text-neutral-300 dark:text-neutral-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No notifications</p>
            </div>
          ) : (
            <ul
              className="max-h-80 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-700"
              role="list"
              aria-label="Recent notifications"
            >
              {notifications.map((n) => (
                <NotificationItem key={n._id} n={n} onRead={(id) => markRead.mutate(id)} />
              ))}
            </ul>
          )}

          {/* Footer */}
          <div className="border-t border-neutral-200 px-4 py-2 dark:border-neutral-700">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-primary-600 dark:text-primary-400 block py-1 text-center text-xs hover:underline focus:underline focus:outline-none"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
