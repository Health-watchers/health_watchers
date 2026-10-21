'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  useNotifications,
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
  useDeleteNotification,
  useBulkDeleteNotifications,
  groupNotificationsByCategory,
  getUnreadCountsByCategory,
  CATEGORY_LABELS,
  type Notification,
  type NotificationCategory,
} from '@/hooks/useNotifications';
import { Spinner, EmptyState } from '@/components/ui';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: NotificationCategory[] = ['all', 'appointment', 'payment', 'lab_result', 'system_alert'];

/** Colour chips for each raw notification type */
const TYPE_COLORS: Record<Notification['type'], string> = {
  referral_received: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  payment_confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  appointment_reminder: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  ai_summary_ready: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  lab_result_ready: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  system: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300',
};

const TYPE_LABELS: Record<Notification['type'], string> = {
  referral_received: 'Referral',
  payment_confirmed: 'Payment',
  appointment_reminder: 'Appointment',
  ai_summary_ready: 'AI Summary',
  lab_result_ready: 'Lab Result',
  system: 'System',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── NotificationRow ──────────────────────────────────────────────────────────

interface NotificationRowProps {
  n: Notification;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
}

function NotificationRow({ n, selected, onSelect }: NotificationRowProps) {
  const router = useRouter();
  const markRead = useMarkRead();
  const deleteNotif = useDeleteNotification();

  const handleClick = () => {
    if (!n.isRead) markRead.mutate(n._id);
    if (n.link) router.push(n.link);
  };

  return (
    <div
      className={[
        'group flex items-start gap-4 rounded-lg border p-4 transition-colors',
        n.isRead
          ? 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800'
          : 'border-primary-200 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20',
        selected ? 'ring-primary-400 ring-2' : '',
      ].join(' ')}
    >
      {/* Checkbox for bulk selection */}
      <div className="mt-1 flex shrink-0 items-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(n._id, e.target.checked)}
          aria-label={`Select notification: ${n.title}`}
          className="text-primary-600 focus:ring-primary-500 h-4 w-4 rounded border-neutral-300"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Unread dot */}
      <div className="mt-1.5 w-2 shrink-0">
        {!n.isRead && (
          <span
            className="bg-primary-500 block h-2 w-2 rounded-full"
            aria-label="Unread"
          />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[n.type]}`}>
            {TYPE_LABELS[n.type]}
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {formatDate(n.createdAt)}
          </span>
        </div>

        {/* Title — clickable deep link */}
        <button
          type="button"
          onClick={handleClick}
          className={[
            'hover:text-primary-600 mt-1 text-left text-sm font-semibold text-neutral-900 focus:underline focus:outline-none dark:text-neutral-100 dark:hover:text-primary-400',
            n.link ? 'cursor-pointer underline-offset-2 hover:underline' : '',
          ].join(' ')}
        >
          {n.title}
        </button>

        <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">{n.message}</p>

        {n.link && (
          <span className="mt-1 inline-block text-xs text-neutral-400 dark:text-neutral-500">
            → {n.link}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {!n.isRead && (
          <button
            type="button"
            onClick={() => markRead.mutate(n._id)}
            disabled={markRead.isPending}
            className="text-primary-600 dark:text-primary-400 text-xs hover:underline focus:underline focus:outline-none disabled:opacity-50"
            aria-label="Mark as read"
          >
            Mark read
          </button>
        )}
        <button
          type="button"
          onClick={() => deleteNotif.mutate(n._id)}
          disabled={deleteNotif.isPending}
          className="text-xs text-neutral-500 hover:text-red-500 focus:text-red-500 focus:outline-none disabled:opacity-50 dark:text-neutral-400"
          aria-label="Delete notification"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<NotificationCategory>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch all notifications in a single call so category counts are accurate
  const { data, isLoading } = useNotifications(1, 100);
  const { data: unreadCount = 0 } = useUnreadCount();
  const markAllRead = useMarkAllRead();
  const bulkDelete = useBulkDeleteNotifications();

  const allNotifications = data?.data ?? [];

  // Grouped by category and unread counts per group
  const grouped = useMemo(
    () => groupNotificationsByCategory(allNotifications),
    [allNotifications]
  );
  const unreadCounts = useMemo(
    () => getUnreadCountsByCategory(allNotifications),
    [allNotifications]
  );

  const visibleNotifications = grouped[activeTab] ?? [];

  // ── Selection helpers ─────────────────────────────────────────────────────

  const handleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const allVisibleSelected =
    visibleNotifications.length > 0 &&
    visibleNotifications.every((n) => selectedIds.has(n._id));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleNotifications.forEach((n) => next.add(n._id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleNotifications.forEach((n) => next.delete(n._id));
        return next;
      });
    }
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    bulkDelete.mutate(ids, {
      onSuccess: () => setSelectedIds(new Set()),
    });
  };

  const selectedInView = visibleNotifications.filter((n) => selectedIds.has(n._id)).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* ── Page header ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
            Notifications
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="text-primary-600 dark:text-primary-400 rounded text-sm hover:underline focus:underline focus:outline-none disabled:opacity-50"
          >
            {markAllRead.isPending ? 'Marking…' : 'Mark all as read'}
          </button>
        )}
      </div>

      {/* ── Category tabs ── */}
      <div
        className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-700 dark:bg-neutral-800"
        role="tablist"
        aria-label="Notification categories"
      >
        {TABS.map((tab) => {
          const count = unreadCounts[tab];
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab}`}
              id={`tab-${tab}`}
              onClick={() => {
                setActiveTab(tab);
                setSelectedIds(new Set());
              }}
              className={[
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500',
                isActive
                  ? 'bg-white text-primary-700 shadow-sm dark:bg-neutral-700 dark:text-primary-300'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100',
              ].join(' ')}
            >
              {CATEGORY_LABELS[tab]}
              {count > 0 && (
                <span
                  className={`flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${
                    isActive
                      ? 'bg-primary-500 text-white'
                      : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-600 dark:text-neutral-200'
                  }`}
                  aria-label={`${count} unread`}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Bulk action bar ── */}
      {visibleNotifications.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
          <input
            type="checkbox"
            id="select-all"
            checked={allVisibleSelected}
            onChange={(e) => handleSelectAll(e.target.checked)}
            aria-label="Select all notifications in current tab"
            className="text-primary-600 focus:ring-primary-500 h-4 w-4 rounded border-neutral-300"
          />
          <label
            htmlFor="select-all"
            className="cursor-pointer text-xs text-neutral-600 dark:text-neutral-400"
          >
            {selectedInView > 0
              ? `${selectedInView} selected`
              : `Select all (${visibleNotifications.length})`}
          </label>

          {selectedInView > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkDelete.isPending}
              className="ml-auto flex items-center gap-1 rounded text-xs font-medium text-red-600 hover:text-red-700 focus:underline focus:outline-none disabled:opacity-50 dark:text-red-400"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              {bulkDelete.isPending ? 'Deleting…' : `Delete ${selectedInView}`}
            </button>
          )}
        </div>
      )}

      {/* ── Tab panel ── */}
      <div
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
      >
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : visibleNotifications.length === 0 ? (
          <EmptyState
            title="No notifications"
            description={
              activeTab === 'all'
                ? "You're all caught up. Notifications will appear here when there's activity."
                : `No ${CATEGORY_LABELS[activeTab].toLowerCase()} notifications yet.`
            }
            icon={
              <svg
                className="h-12 w-12 text-neutral-300 dark:text-neutral-600"
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
            }
          />
        ) : (
          <div className="space-y-2">
            {visibleNotifications.map((n) => (
              <NotificationRow
                key={n._id}
                n={n}
                selected={selectedIds.has(n._id)}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
