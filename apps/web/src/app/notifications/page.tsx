'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  useNotifications,
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
  useDeleteNotification,
  useBulkDelete,
  TYPE_LABELS,
  TYPE_COLORS,
  TYPE_CATEGORY,
  CATEGORY_LABELS,
  type Notification,
  type NotificationCategory,
} from '@/hooks/useNotifications';
import { PageWrapper, Spinner, EmptyState, Pagination } from '@/components/ui';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Category icon map ────────────────────────────────────────────────────────

function CategoryIcon({ category }: { category: NotificationCategory }) {
  if (category === 'appointment')
    return (
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
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    );
  if (category === 'payment')
    return (
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
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
      </svg>
    );
  if (category === 'lab_result')
    return (
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
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
      </svg>
    );
  if (category === 'system')
    return (
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
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  // "all"
  return (
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
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

// ─── Single row ───────────────────────────────────────────────────────────────

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
      role="row"
      aria-selected={selected}
      className={[
        'group flex items-start gap-3 rounded-lg border p-4 transition-colors',
        selected
          ? 'border-primary-300 bg-primary-50/60 dark:border-primary-700 dark:bg-primary-900/20'
          : n.isRead
            ? 'border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700/60'
            : 'border-primary-200 bg-primary-50 hover:bg-primary-100/60 dark:border-primary-800 dark:bg-primary-900/30',
      ].join(' ')}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onSelect(n._id, e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select notification: ${n.title}`}
        className="text-primary-600 focus:ring-primary-500 mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-neutral-300"
      />

      {/* Unread dot */}
      <div className="mt-1.5 w-2 shrink-0">
        {!n.isRead && (
          <span className="bg-primary-500 block h-2 w-2 rounded-full" aria-label="Unread" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[n.type]}`}>
            {TYPE_LABELS[n.type]}
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            <time dateTime={n.createdAt} title={formatDate(n.createdAt)}>
              {timeAgo(n.createdAt)}
            </time>
          </span>
        </div>

        <button
          type="button"
          onClick={handleClick}
          className={[
            'hover:text-primary-600 mt-1 text-left text-sm font-semibold focus:underline focus:outline-none',
            n.isRead
              ? 'text-neutral-700 dark:text-neutral-300'
              : 'text-neutral-900 dark:text-neutral-100',
          ].join(' ')}
        >
          {n.title}
          {n.link && (
            <span
              className="ml-1 text-xs font-normal text-neutral-400 dark:text-neutral-500"
              aria-label="Has deep link"
            >
              ↗
            </span>
          )}
        </button>
        <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">{n.message}</p>
      </div>

      {/* Per-row actions */}
      <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {!n.isRead && (
          <button
            type="button"
            onClick={() => markRead.mutate(n._id)}
            disabled={markRead.isPending}
            className="text-primary-600 text-xs hover:underline focus:underline focus:outline-none disabled:opacity-50"
            aria-label="Mark as read"
          >
            Mark read
          </button>
        )}
        <button
          type="button"
          onClick={() => deleteNotif.mutate(n._id)}
          disabled={deleteNotif.isPending}
          className="rounded p-0.5 text-neutral-400 hover:text-red-500 focus:ring-1 focus:ring-red-400 focus:outline-none disabled:opacity-50"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Category group header ────────────────────────────────────────────────────

function GroupHeader({ category, count }: { category: NotificationCategory; count: number }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
        <CategoryIcon category={category} />
        {CATEGORY_LABELS[category]}
      </span>
      <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
        {count}
      </span>
      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ALL_CATEGORIES: NotificationCategory[] = [
  'all',
  'appointment',
  'payment',
  'lab_result',
  'system',
];

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [activeCategory, setActiveCategory] = useState<NotificationCategory>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = useNotifications(page, 20);
  const { data: unreadCount = 0 } = useUnreadCount();
  const markAllRead = useMarkAllRead();
  const bulkDelete = useBulkDelete();

  const allNotifications: Notification[] = data?.data ?? [];
  const pagination = data?.pagination;

  // ── Category counts (for tab badges) ──
  const categoryCounts = useMemo(() => {
    const counts: Record<NotificationCategory, number> = {
      all: allNotifications.length,
      appointment: 0,
      payment: 0,
      lab_result: 0,
      system: 0,
    };
    allNotifications.forEach((n) => {
      counts[TYPE_CATEGORY[n.type]]++;
    });
    return counts;
  }, [allNotifications]);

  // ── Filtered list ──
  const filtered = useMemo(
    () =>
      activeCategory === 'all'
        ? allNotifications
        : allNotifications.filter((n) => TYPE_CATEGORY[n.type] === activeCategory),
    [allNotifications, activeCategory]
  );

  // ── Grouped view (only in "all" tab) ──
  const groups = useMemo(() => {
    if (activeCategory !== 'all') return null;
    const map = new Map<NotificationCategory, Notification[]>();
    for (const n of filtered) {
      const cat = TYPE_CATEGORY[n.type];
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(n);
    }
    return map;
  }, [activeCategory, filtered]);

  // ── Selection helpers ──
  const visibleIds = filtered.map((n) => n._id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleIds));
    }
  };

  const handleBulkDelete = () => {
    bulkDelete.mutate([...selected], {
      onSuccess: () => setSelected(new Set()),
    });
  };

  // Switch category clears selection
  const handleCategoryChange = (cat: NotificationCategory) => {
    setActiveCategory(cat);
    setSelected(new Set());
    setPage(1);
  };

  // ── Render ──
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* ── Page header ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            Notifications
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="text-primary-600 text-sm hover:underline focus:underline focus:outline-none disabled:opacity-50"
            >
              {markAllRead.isPending ? 'Marking…' : 'Mark all as read'}
            </button>
          )}
        </div>
      </div>

      {/* ── Category tabs ── */}
      <div
        role="tablist"
        aria-label="Notification categories"
        className="mb-4 flex gap-1 overflow-x-auto border-b border-neutral-200 pb-0 dark:border-neutral-700"
      >
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={activeCategory === cat}
            type="button"
            onClick={() => handleCategoryChange(cat)}
            className={[
              'flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
              'focus:ring-primary-400 -mb-px rounded-t border-b-2 focus:ring-2 focus:outline-none',
              activeCategory === cat
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200',
            ].join(' ')}
          >
            <CategoryIcon category={cat} />
            {CATEGORY_LABELS[cat]}
            {categoryCounts[cat] > 0 && (
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                  activeCategory === cat
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                    : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
                ].join(' ')}
              >
                {categoryCounts[cat]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Bulk action toolbar ── */}
      {filtered.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            aria-label={allSelected ? 'Deselect all' : 'Select all'}
            className="text-primary-600 focus:ring-primary-500 h-4 w-4 cursor-pointer rounded border-neutral-300"
          />
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {someSelected ? `${selected.size} selected` : 'Select all'}
          </span>

          {someSelected && (
            <>
              <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-600" />
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={bulkDelete.isPending}
                className="text-xs font-medium text-red-500 hover:text-red-600 focus:underline focus:outline-none disabled:opacity-50"
              >
                {bulkDelete.isPending ? 'Deleting…' : `Delete (${selected.size})`}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Content ── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No notifications"
          description={
            activeCategory === 'all'
              ? "You're all caught up. Notifications will appear here when there's activity."
              : `No ${CATEGORY_LABELS[activeCategory].toLowerCase()} notifications.`
          }
          icon={
            <svg
              className="h-12 w-12 text-neutral-300"
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
      ) : groups ? (
        /* Grouped view for "all" tab */
        <div role="rowgroup" className="space-y-1">
          {Array.from(groups.entries()).map(([cat, items]) => (
            <div key={cat}>
              <GroupHeader category={cat} count={items.length} />
              <div className="space-y-2">
                {items.map((n) => (
                  <NotificationRow
                    key={n._id}
                    n={n}
                    selected={selected.has(n._id)}
                    onSelect={toggleSelect}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Flat list for filtered tabs */
        <div role="rowgroup" className="space-y-2">
          {filtered.map((n) => (
            <NotificationRow
              key={n._id}
              n={n}
              selected={selected.has(n._id)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-6">
          <Pagination page={page} totalPages={pagination.pages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
