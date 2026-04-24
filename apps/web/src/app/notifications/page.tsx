'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useNotifications,
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
  useDeleteNotification,
  type Notification,
} from '@/hooks/useNotifications';
import { PageWrapper, PageHeader, Spinner, EmptyState, Pagination } from '@/components/ui';

const TYPE_LABELS: Record<Notification['type'], string> = {
  referral_received:    'Referral',
  payment_confirmed:    'Payment',
  appointment_reminder: 'Appointment',
  ai_summary_ready:     'AI Summary',
  lab_result_ready:     'Lab Result',
  system:               'System',
};

const TYPE_COLORS: Record<Notification['type'], string> = {
  referral_received:    'bg-blue-100 text-blue-700',
  payment_confirmed:    'bg-green-100 text-green-700',
  appointment_reminder: 'bg-yellow-100 text-yellow-700',
  ai_summary_ready:     'bg-purple-100 text-purple-700',
  lab_result_ready:     'bg-orange-100 text-orange-700',
  system:               'bg-neutral-100 text-neutral-600',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function NotificationRow({ n }: { n: Notification }) {
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
        'flex items-start gap-4 p-4 rounded-lg border transition-colors',
        n.isRead
          ? 'bg-white border-neutral-200'
          : 'bg-primary-50 border-primary-200',
      ].join(' ')}
    >
      {/* Unread dot */}
      <div className="mt-1 shrink-0 w-2">
        {!n.isRead && <span className="block h-2 w-2 rounded-full bg-primary-500" aria-label="Unread" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[n.type]}`}>
            {TYPE_LABELS[n.type]}
          </span>
          <span className="text-xs text-neutral-500">{formatDate(n.createdAt)}</span>
        </div>
        <button
          type="button"
          onClick={handleClick}
          className="mt-1 text-sm font-semibold text-neutral-900 hover:text-primary-600 focus:outline-none focus:underline text-left"
        >
          {n.title}
        </button>
        <p className="text-sm text-neutral-600 mt-0.5">{n.message}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {!n.isRead && (
          <button
            type="button"
            onClick={() => markRead.mutate(n._id)}
            className="text-xs text-primary-600 hover:underline focus:outline-none focus:underline"
            aria-label="Mark as read"
          >
            Mark read
          </button>
        )}
        <button
          type="button"
          onClick={() => deleteNotif.mutate(n._id)}
          className="text-xs text-neutral-500 hover:text-red-500 focus:outline-none"
          aria-label="Delete notification"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useNotifications(page, 20);
  const { data: unreadCount = 0 } = useUnreadCount();
  const markAllRead = useMarkAllRead();

  const notifications = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <PageWrapper>
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        actions={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="text-sm text-primary-600 hover:underline focus:outline-none focus:underline disabled:opacity-50"
            >
              Mark all as read
            </button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="You're all caught up. Notifications will appear here when there's activity."
          icon={
            <svg className="w-12 h-12 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <NotificationRow key={n._id} n={n} />
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="mt-6">
          <Pagination
            page={page}
            totalPages={pagination.pages}
            onPageChange={setPage}
          />
        </div>
      )}
    </PageWrapper>
  );
}
