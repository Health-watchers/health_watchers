'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Subscribes to Socket.IO real-time events and invalidates the relevant
 * React Query caches so lists refresh automatically.
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

    socket.on("notification:new", () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    });

    return () => {
      socket.off('patient:created');
      socket.off('patient:updated');
      socket.off('encounter:created');
      socket.off('encounter:updated');
      socket.off('payment:confirmed');
      socket.off('notification:new');
      disconnectSocket();
    };
  }, [accessToken, queryClient]);
}
