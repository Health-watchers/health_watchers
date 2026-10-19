'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Subscribes to Socket.IO real-time events and invalidates the relevant
 * React Query caches so lists refresh automatically.
 *
 * Also dispatches custom DOM events (e.g. `notification:new`) so that
 * components like NotificationBell can react without needing direct access
 * to the query client.
 *
 * @param accessToken - JWT access token from the auth cookie / context
 */
export function useRealtimeUpdates(accessToken: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken) return;

    const socket = getSocket(accessToken);

    socket.on('patient:created', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
    });

    socket.on('patient:updated', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
    });

    socket.on('encounter:created', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.encounters.all });
    });

    socket.on('encounter:updated', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.encounters.all });
    });

    socket.on('payment:confirmed', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
    });

    /**
     * notification:new — invalidate notification list + bump unread count optimistically.
     * The socket.ts SocketManager also dispatches a DOM CustomEvent so that
     * NotificationBell (which may not use this hook) can react immediately.
     */
    socket.on('notification:new', () => {
      // Bump unread count by 1 optimistically, then re-fetch to reconcile
      queryClient.setQueryData<number>(
        queryKeys.notifications.unreadCount(),
        (old) => (old ?? 0) + 1
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    });

    socket.on('cosignature:requested', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.encounters.pendingCosignatures() });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    });

    socket.on('cosignature:completed', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.encounters.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    });

    socket.on('cosignature:rejected', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.encounters.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    });

    return () => {
      socket.off('patient:created');
      socket.off('patient:updated');
      socket.off('encounter:created');
      socket.off('encounter:updated');
      socket.off('payment:confirmed');
      socket.off('notification:new');
      socket.off('cosignature:requested');
      socket.off('cosignature:completed');
      socket.off('cosignature:rejected');
      disconnectSocket();
    };
  }, [accessToken, queryClient]);
}
