'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export interface Notification {
  _id: string;
  userId: string;
  clinicId: string;
  type: 'referral_received' | 'payment_confirmed' | 'appointment_reminder' | 'ai_summary_ready' | 'lab_result_ready' | 'system';
  title: string;
  message: string;
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

async function fetchNotifications(page = 1, limit = 20): Promise<NotificationsResponse> {
  const res = await fetch(`/api/notifications?page=${page}&limit=${limit}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

async function fetchUnreadCount(): Promise<number> {
  const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
  if (!res.ok) return 0;
  const body = await res.json();
  return body.data?.count ?? 0;
}

export function useNotifications(page = 1, limit = 20) {
  return useQuery({
    queryKey: queryKeys.notifications.list(page),
    queryFn: () => fetchNotifications(page, limit),
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000, // fallback polling every 60s
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/notifications/${id}/read`, { method: 'PUT', credentials: 'include' }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetch('/api/notifications/read-all', { method: 'PUT', credentials: 'include' }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/notifications/${id}`, { method: 'DELETE', credentials: 'include' }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
