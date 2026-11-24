'use client';

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Broad categories shown as tabs in the notifications center. */
export type NotificationCategory = 'all' | 'appointment' | 'payment' | 'lab_result' | 'system';

/** Granular type stored in the database. Must stay in sync with the API's NOTIFICATION_TYPES. */
export type NotificationType =
  | 'referral_received'
  | 'payment_confirmed'
  | 'appointment_reminder'
  | 'appointment_status_update'
  | 'ai_summary_ready'
  | 'lab_result_ready'
  | 'high_risk_patient'
  | 'system'
  | 'balance_low_warning'
  | 'balance_critical'
  | 'large_transaction'
  | 'unrecognized_transaction'
  | 'waitlist_available'
  | 'claimable_expiring'
  | 'subscription_warning'
  | 'follow_up_reminder';

export interface Notification {
  _id: string;
  userId: string;
  clinicId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Optional deep-link path, e.g. /appointments/abc123 */
  link?: string;
  isRead: boolean;
  readAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface ApiNotificationsResponse {
  status: string;
  data: Notification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    /** API field name */
    totalPages?: number;
    /** Normalized field name used by the frontend */
    pages?: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
}

interface NotificationsResponse {
  status: string;
  data: Notification[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

// ─── Category helpers ─────────────────────────────────────────────────────────

/** Map each granular NotificationType to a NotificationCategory. */
export const TYPE_CATEGORY: Record<NotificationType, NotificationCategory> = {
  appointment_reminder: 'appointment',
  appointment_status_update: 'appointment',
  referral_received: 'appointment',
  follow_up_reminder: 'appointment',
  waitlist_available: 'appointment',
  payment_confirmed: 'payment',
  balance_low_warning: 'payment',
  balance_critical: 'payment',
  large_transaction: 'payment',
  unrecognized_transaction: 'payment',
  subscription_warning: 'payment',
  claimable_expiring: 'payment',
  lab_result_ready: 'lab_result',
  ai_summary_ready: 'lab_result',
  high_risk_patient: 'lab_result',
  system: 'system',
};

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  all: 'All',
  appointment: 'Appointments',
  payment: 'Payments',
  lab_result: 'Lab Results',
  system: 'System',
};

export const TYPE_LABELS: Record<NotificationType, string> = {
  referral_received: 'Referral',
  payment_confirmed: 'Payment',
  appointment_reminder: 'Appointment',
  appointment_status_update: 'Appt. Update',
  ai_summary_ready: 'AI Summary',
  lab_result_ready: 'Lab Result',
  high_risk_patient: 'High Risk',
  system: 'System',
  balance_low_warning: 'Low Balance',
  balance_critical: 'Critical Balance',
  large_transaction: 'Large Transaction',
  unrecognized_transaction: 'Unrecognized Txn',
  waitlist_available: 'Waitlist',
  claimable_expiring: 'Expiring Claim',
  subscription_warning: 'Subscription',
  follow_up_reminder: 'Follow-up',
};

export const TYPE_COLORS: Record<NotificationType, string> = {
  referral_received: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  payment_confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  appointment_reminder: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  appointment_status_update:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  ai_summary_ready: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  lab_result_ready: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  high_risk_patient: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  system: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300',
  balance_low_warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  balance_critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  large_transaction: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  unrecognized_transaction: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  waitlist_available: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  claimable_expiring: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  subscription_warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  follow_up_reminder: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
};

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchNotifications(page = 1, limit = 20): Promise<NotificationsResponse> {
  const res = await fetch(`/api/notifications?page=${page}&limit=${limit}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch notifications');
  const body: ApiNotificationsResponse = await res.json();
  // Normalize pagination: API returns totalPages, frontend expects pages
  const p = body.pagination;
  return {
    status: body.status,
    data: body.data,
    pagination: {
      page: p.page,
      limit: p.limit,
      total: p.total,
      pages: p.pages ?? p.totalPages ?? 1,
    },
  };
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
  if (!res.ok) return 0;
  const body = await res.json();
  return body.data?.count ?? 0;
}

// ─── Optimistic helper ────────────────────────────────────────────────────────

/**
 * Snapshot and optimistically mark a single notification as read inside
 * the React Query cache. Returns the previous data for rollback.
 */
function optimisticMarkRead(qc: QueryClient, id: string) {
  // All cached list pages
  const keys = qc
    .getQueryCache()
    .findAll({ queryKey: queryKeys.notifications.all })
    .map((q) => q.queryKey);

  const snapshots: Array<{ key: unknown[]; prev: unknown }> = [];

  keys.forEach((key) => {
    const prev = qc.getQueryData(key);
    qc.setQueryData<NotificationsResponse>(key as Parameters<typeof qc.setQueryData>[0], (old) => {
      if (!old || !old.data) return old;
      return {
        ...old,
        data: old.data.map((n) =>
          n._id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        ),
      };
    });
    snapshots.push({ key: key as unknown[], prev });
  });

  // Optimistically decrement unread count
  const ucKey = queryKeys.notifications.unreadCount();
  const prevCount = qc.getQueryData<number>(ucKey);
  qc.setQueryData<number>(ucKey, (old) => Math.max(0, (old ?? 0) - 1));
  snapshots.push({ key: ucKey as unknown as unknown[], prev: prevCount });

  return snapshots;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useNotifications(page = 1, limit = 20) {
  return useQuery({
    queryKey: queryKeys.notifications.list(page),
    queryFn: () => fetchNotifications(page, limit),
  });
}

export function useUnreadCount() {
  return useQuery<number>({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000, // fallback polling every 60 s
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/notifications/${id}/read`, { method: 'PUT', credentials: 'include' }).then((r) =>
        r.json()
      ),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.notifications.all });
      return { snapshots: optimisticMarkRead(qc, id) };
    },
    onError: (_err, _id, ctx) => {
      ctx?.snapshots.forEach(({ key, prev }) => qc.setQueryData(key, prev));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetch('/api/notifications/read-all', { method: 'PUT', credentials: 'include' }).then((r) =>
        r.json()
      ),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.notifications.all });

      const keys = qc
        .getQueryCache()
        .findAll({ queryKey: queryKeys.notifications.all })
        .map((q) => q.queryKey);

      const snapshots: Array<{ key: unknown[]; prev: unknown }> = [];
      keys.forEach((key) => {
        const prev = qc.getQueryData(key);
        qc.setQueryData<NotificationsResponse>(
          key as Parameters<typeof qc.setQueryData>[0],
          (old) => {
            if (!old || !old.data) return old;
            return {
              ...old,
              data: old.data.map((n) => ({
                ...n,
                isRead: true,
                readAt: new Date().toISOString(),
              })),
            };
          }
        );
        snapshots.push({ key: key as unknown[], prev });
      });

      const ucKey = queryKeys.notifications.unreadCount();
      const prevCount = qc.getQueryData<number>(ucKey);
      qc.setQueryData<number>(ucKey, 0);
      snapshots.push({ key: ucKey as unknown as unknown[], prev: prevCount });

      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(({ key, prev }) => qc.setQueryData(key, prev));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/notifications/${id}`, { method: 'DELETE', credentials: 'include' }).then((r) =>
        r.json()
      ),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.notifications.all });

      const keys = qc
        .getQueryCache()
        .findAll({ queryKey: queryKeys.notifications.all })
        .map((q) => q.queryKey);

      const snapshots: Array<{ key: unknown[]; prev: unknown }> = [];

      keys.forEach((key) => {
        const prev = qc.getQueryData(key);
        qc.setQueryData<NotificationsResponse>(
          key as Parameters<typeof qc.setQueryData>[0],
          (old) => {
            if (!old || !old.data) return old;
            const removed = old.data.find((n) => n._id === id);
            const wasUnread = removed && !removed.isRead;
            return {
              ...old,
              data: old.data.filter((n) => n._id !== id),
              pagination: {
                ...old.pagination,
                total: Math.max(0, old.pagination.total - 1),
              },
              ...(wasUnread && {}), // handled separately below
            };
          }
        );
        snapshots.push({ key: key as unknown[], prev });
      });

      // Decrement unread count if the deleted item was unread
      const allData = qc
        .getQueryCache()
        .findAll({ queryKey: queryKeys.notifications.all })
        .flatMap((q) => (q.state.data as NotificationsResponse | undefined)?.data ?? []);
      const wasUnread = allData.find((n) => n._id === id && !n.isRead);

      if (wasUnread) {
        const ucKey = queryKeys.notifications.unreadCount();
        const prevCount = qc.getQueryData<number>(ucKey);
        qc.setQueryData<number>(ucKey, (old) => Math.max(0, (old ?? 0) - 1));
        snapshots.push({ key: ucKey as unknown as unknown[], prev: prevCount });
      }

      return { snapshots };
    },
    onError: (_err, _id, ctx) => {
      ctx?.snapshots.forEach(({ key, prev }) => qc.setQueryData(key, prev));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

/** Bulk delete a list of notification IDs. */
export function useBulkDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/notifications/${id}`, { method: 'DELETE', credentials: 'include' })
        )
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function usePendingCosignatures() {
  return useQuery({
    queryKey: queryKeys.encounters.pendingCosignatures(),
    queryFn: async () => {
      const res = await fetch('/api/encounters/pending-cosignatures', { credentials: 'include' });
      if (!res.ok) return { count: 0, data: [] };
      return res.json();
    },
    refetchInterval: 60_000,
  });
}
