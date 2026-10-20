'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useUnreadCount,
  useNotifications,
  useMarkRead,
  useMarkAllRead,
  usePendingCosignatures,
  type Notification,
} from '@/hooks/useNotifications';

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
          'w-full border-b border-neutral-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-neutral-50',
          !n.isRead ? 'bg-primary-50' : '',
        ].join(' ')}
      >
        <div className="flex items-start gap-2">
          {!n.isRead && (
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500"
              aria-hidden="true"
            />
          )}
          <div className={!n.isRead ? '' : 'pl-4'}>
            <p className="text-sm font-medium leading-snug text-neutral-900">{n.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{n.message}</p>
            <p className="mt-1 text-xs text-neutral-500">{timeAgo(n.createdAt)}</p>
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
        aria-label={`Notifications${count > 0 ? `, ${count} unread` : ''}${cosignCount > 0 ? `, ${cosignCount} pending co-signatures` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'notification-panel' : undefined}
        className="relative rounded-md p-2 text-neutral-500 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
        {count > 0 && (
          <span
            className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white"
            aria-hidden="true"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
        {cosignCount > 0 && (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-0.5 text-[10px] font-bold leading-none text-white"
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
          id="notification-panel"
          role="region"
          aria-label="Notifications"
          aria-live="polite"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">Notifications</h2>
            {count > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="text-xs text-primary-600 hover:underline focus:underline focus:outline-none"
              >
                {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">No notifications</p>
          ) : (
            <ul className="max-h-80 divide-y divide-neutral-100 overflow-y-auto" role="list">
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
              className="block py-1 text-center text-xs text-primary-600 hover:underline focus:underline focus:outline-none"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
