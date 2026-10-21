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
  getUnreadCountsByCategory,
  CATEGORY_LABELS,
  type Notification,
  type NotificationCategory,
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

const CATEGORY_ICONS: Record<NotificationCategory, React.ReactNode> = {
  all: null,
  appointment: (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  payment: (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  lab_result: (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  system_alert: (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

// ─── NotificationItem ─────────────────────────────────────────────────────────

function NotificationItem({
  n,
  onRead,
  onClose,
}: {
  n: Notification;
  onRead: (id: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();

  const handleClick = () => {
    if (!n.isRead) onRead(n._id);
    onClose();
    if (n.link) router.push(n.link);
  };

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className={[
          'w-full border-b border-neutral-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-700',
          !n.isRead ? 'bg-primary-50 dark:bg-primary-900/20' : '',
        ].join(' ')}
      >
        <div className="flex items-start gap-2">
          {!n.isRead && (
            <span
              className="bg-primary-500 mt-1.5 h-2 w-2 shrink-0 rounded-full"
              aria-hidden="true"
            />
          )}
          <div className={!n.isRead ? '' : 'pl-4'}>
            <p className="text-sm font-medium leading-snug text-neutral-900 dark:text-neutral-100">
              {n.title}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
              {n.message}
            </p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              {timeAgo(n.createdAt)}
            </p>
          </div>
        </div>
      </button>
    </li>
  );
}

// ─── CategoryBadge strip ──────────────────────────────────────────────────────

const BADGE_CATEGORIES: Exclude<NotificationCategory, 'all'>[] = [
  'appointment',
  'payment',
  'lab_result',
  'system_alert',
];

function CategoryBadges({
  counts,
}: {
  counts: Record<NotificationCategory, number>;
}) {
  const nonZero = BADGE_CATEGORIES.filter((c) => counts[c] > 0);
  if (nonZero.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 border-b border-neutral-200 px-4 py-2 dark:border-neutral-700">
      {nonZero.map((cat) => (
        <Link
          key={cat}
          href={`/notifications?tab=${cat}`}
          className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
          title={`${counts[cat]} unread ${CATEGORY_LABELS[cat]}`}
        >
          {CATEGORY_ICONS[cat]}
          <span>{CATEGORY_LABELS[cat]}</span>
          <span className="bg-primary-500 ml-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] text-white">
            {counts[cat] > 9 ? '9+' : counts[cat]}
          </span>
        </Link>
      ))}
    </div>
  );
}

// ─── NotificationBell ─────────────────────────────────────────────────────────

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: count = 0 } = useUnreadCount();
  // Fetch last 15 for the dropdown preview
  const { data } = useNotifications(1, 15);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const { data: cosignData } = usePendingCosignatures();
  const cosignCount: number = (cosignData as any)?.count ?? 0;

  const notifications = data?.data ?? [];

  // Per-category unread counts for badge strip
  const unreadCounts = getUnreadCountsByCategory(notifications);

  // ── WebSocket real-time: invalidate on notification:new ───────────────────
  useEffect(() => {
    // Listen for the custom window event dispatched by socket.ts / SocketManager
    const handleNew = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    };
    window.addEventListener('notification:new', handleNew);
    return () => window.removeEventListener('notification:new', handleNew);
  }, [queryClient]);

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      {/* ── Bell button ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={[
          `Notifications`,
          count > 0 ? `, ${count} unread` : '',
          cosignCount > 0 ? `, ${cosignCount} pending co-signatures` : '',
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

        {/* Total unread badge */}
        {count > 0 && (
          <span
            className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white"
            aria-hidden="true"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}

        {/* Co-signature badge (bottom-right) */}
        {cosignCount > 0 && (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-0.5 text-[10px] font-bold leading-none text-white"
            title={`${cosignCount} pending co-signature${cosignCount !== 1 ? 's' : ''}`}
            aria-label={`${cosignCount} pending co-signatures`}
          >
            {cosignCount > 9 ? '9+' : cosignCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Notifications
            </h2>
            {count > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-primary-600 dark:text-primary-400 text-xs hover:underline focus:underline focus:outline-none disabled:opacity-50"
              >
                {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* Per-category badge strip */}
          <CategoryBadges counts={unreadCounts} />

          {/* Notification list */}
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No notifications
            </p>
          ) : (
            <ul
              className="max-h-80 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-700"
              role="list"
            >
              {notifications.map((n) => (
                <NotificationItem
                  key={n._id}
                  n={n}
                  onRead={(id) => markRead.mutate(id)}
                  onClose={() => setOpen(false)}
                />
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
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
