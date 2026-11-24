import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export interface AppNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationsPage {
  notifications: AppNotification[];
  total: number;
  unreadCount: number;
  page: number;
  totalPages: number;
}

export function useNotifications(page = 1) {
  return useQuery<NotificationsPage>({
    queryKey: queryKeys.notifications.list(page),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/notifications?page=${page}`);
      if (!res.ok) throw new Error(`Failed to load notifications (${res.status})`);
      return res.json().then((d) => ({
        notifications: d.data ?? [],
        total: d.total ?? 0,
        unreadCount: d.unreadCount ?? 0,
        page: d.page ?? 1,
        totalPages: d.totalPages ?? 1,
      }));
    },
  });
}

export function useUnreadNotificationCount() {
  return useQuery<number>({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/notifications/unread-count`);
      if (!res.ok) throw new Error(`Failed to fetch unread count (${res.status})`);
      const data = await res.json();
      return data.count ?? 0;
    },
    refetchInterval: 60_000, // poll every 60 s
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetchWithAuth(`${API_V1}/notifications/${id}/read`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error(`Failed to mark notification as read (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/notifications/mark-all-read`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Failed to mark all notifications as read (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
