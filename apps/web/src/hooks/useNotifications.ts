'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

// ─── Types ────────────────────────────────────────────────────────────────────

/** All notification type values recognised by the system. */
export type NotificationType =
  | 'referral_received'
  | 'payment_confirmed'
  | 'appointment_reminder'
  | 'ai_summary_ready'
  | 'lab_result_ready'
  | 'system';

/**
 * UI-facing category buckets used for the grouped-tab view.
 * Maps several raw notification types into four display groups plus "all".
 */
export type NotificationCategory =
  | 'all'
  | 'appointment'
  | 'payment'
  | 'lab_result'
  | 'system_alert';

export interface Notification {
  _id: string;
  userId: string;
  clinicId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Optional deep-link path (e.g. "/appointments/abc123"). */
  link?: string;
  isRead: boolean;
  readAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface NotificationsResponse {
  status: string;
  data: Notification[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

// ─── Category mapping ─────────────────────────────────────────────────────────

/**
 * Maps raw notification types to their UI category bucket.
 * Used by both the page tabs and the bell badge breakdown.
 */
export const TYPE_TO_CATEGORY: Record<NotificationType, NotificationCategory> = {
  appointment_reminder: 'appointment',
  payment_confirmed: 'payment',
  lab_result_ready: 'lab_result',
  ai_summary_ready: 'lab_result', // grouped with lab results in the UI
  referral_received: 'system_alert',
  system: 'system_alert',
};

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  all: 'All',
  appointment: 'Appointments',
  payment: 'Payments',
  lab_result: 'Lab Results',
  system_alert: 'System Alerts',
};

/**
 * Groups a flat list of notifications into a record keyed by category.
 * The "all" key always contains every notification.
 */
export function groupNotificationsByCategory(
  notifications: Notification[]
): Record<NotificationCategory, Notification[]> {
  const groups: Record<NotificationCategory, Notification[]> = {
    all: [],
    appointment: [],
    payment: [],
    lab_result: [],
    system_alert: [],
  };

  for (const n of notifications) {
    groups.all.push(n);
    const category = TYPE_TO_CATEGORY[n.type] ?? 'system_alert';
    groups[category].push(n);
  }

  return groups;
}

/**
 * Returns unread counts per category from a flat notification list.
 * Used by NotificationBell to show per-group badges.
 */
export function getUnreadCountsByCategory(
  notifications: Notification[]
): Record<NotificationCategory, number> {
  const counts: Record<NotificationCategory, number> = {
    all: 0,
    appointment: 0,
    payment: 0,
    lab_result: 0,
    system_alert: 0,
  };

  for (const n of notifications) {
    if (!n.isRead) {
      counts.all += 1;
      const category = TYPE_TO_CATEGORY[n.type] ?? 'system_alert';
      counts[category] += 1;
    }
  }

  return counts;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchNotifications(page = 1, limit = 50): Promise<NotificationsResponse> {
  const res = await fetch(`/api/notifications?page=${page}&limit=${limit}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

async function fetchUnreadCount(): Promise<number> {
  const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
  if (!res.ok) return 0;
  const body = await res.json();
  return body.data?.count ?? 0;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useNotifications(page = 1, limit = 50) {
  return useQuery({
    queryKey: queryKeys.notifications.list(page),
    queryFn: () => fetchNotifications(page, limit),
  });
}

/** Total unread count with 60-second polling fallback (superseded by WebSocket events). */
export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/notifications/${id}/read`, { method: 'PUT', credentials: 'include' }).then((r) =>
        r.json()
      ),
    onSuccess: () => {
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
    onSuccess: () => {
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

/** Bulk-delete a set of notifications by ID. */
export function useBulkDeleteNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      fetch('/api/notifications/bulk-delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => r.json()),
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
