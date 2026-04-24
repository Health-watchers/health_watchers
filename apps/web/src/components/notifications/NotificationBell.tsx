'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUnreadCount, useNotifications, useMarkRead, useMarkAllRead, type Notification } from '@/hooks/useNotifications';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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
          'w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors border-b border-neutral-100 last:border-0',
          !n.isRead ? 'bg-primary-50' : '',
        ].join(' ')}
      >
        <div className="flex items-start gap-2">
          {!n.isRead && (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" aria-hidden="true" />
          )}
          <div className={!n.isRead ? '' : 'pl-4'}>
            <p className="text-sm font-medium text-neutral-900 leading-snug">{n.title}</p>
            <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{n.message}</p>
            <p className="text-xs text-neutral-400 mt-1">{timeAgo(n.createdAt)}</p>
          </div>
        </div>
      </button>
    </li>
  );
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: count = 0 } = useUnreadCount();
  const { data } = useNotifications(1, 10);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const notifications = data?.data ?? [];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${count > 0 ? `, ${count} unread` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative p-2 rounded-md text-neutral-500 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {/* Bell icon */}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span
            className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none"
            aria-hidden="true"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-neutral-200 z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
            <h2 className="text-sm font-semibold text-neutral-900">Notifications</h2>
            {count > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="text-xs text-primary-600 hover:underline focus:outline-none focus:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500 text-center">No notifications</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-neutral-100" role="list">
              {notifications.map((n) => (
                <NotificationItem
                  key={n._id}
                  n={n}
                  onRead={(id) => markRead.mutate(id)}
                />
              ))}
            </ul>
          )}

          {/* Footer */}
          <div className="border-t border-neutral-200 px-4 py-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs text-primary-600 hover:underline focus:outline-none focus:underline py-1"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
