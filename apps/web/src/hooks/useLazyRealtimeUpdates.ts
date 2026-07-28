'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

interface SocketManager {
  connect: (token: string) => any;
  disconnect: () => void;
}

let socketManagerPromise: Promise<SocketManager> | null = null;

async function getSocketManager(): Promise<SocketManager> {
  if (!socketManagerPromise) {
    socketManagerPromise = import('@/lib/socket').then((mod) => ({
      connect: (token: string) => mod.getSocket(token),
      disconnect: () => mod.disconnectSocket(),
    }));
  }
  return socketManagerPromise;
}

export function useLazyRealtimeUpdates(accessToken: string | null) {
  const queryClient = useQueryClient();
  const socketRef = useRef<any>(null);

  useEffect(() => {
    if (!accessToken) return;

    let mounted = true;

    async function connectSocket() {
      const manager = await getSocketManager();
      if (!mounted) return;

      const socket = manager.connect(accessToken);
      socketRef.current = socket;

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

      socket.on('notification:new', () => {
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
    }

    connectSocket();

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.off('patient:created');
        socketRef.current.off('patient:updated');
        socketRef.current.off('encounter:created');
        socketRef.current.off('encounter:updated');
        socketRef.current.off('payment:confirmed');
        socketRef.current.off('notification:new');
        socketRef.current.off('cosignature:requested');
        socketRef.current.off('cosignature:completed');
        socketRef.current.off('cosignature:rejected');

        getSocketManager().then((manager) => manager.disconnect());
      }
    };
  }, [accessToken, queryClient]);
}
