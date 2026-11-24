'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface RealtimeContextValue {
  /** Current WebSocket connection status. */
  status: RealtimeConnectionStatus;
  /** True when the socket is connected and live updates are flowing. */
  isConnected: boolean;
  /** True when the socket is unavailable and consumers should fall back to polling. */
  isFallback: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  status: 'connecting',
  isConnected: false,
  isFallback: false,
});

/** Access the realtime connection status from any descendant of the provider. */
export function useRealtimeStatus(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

/** Reads the accessToken cookie on the client and activates real-time updates. */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<RealtimeConnectionStatus>('connecting');

  useEffect(() => {
    // Parse the accessToken from document.cookie
    const match = document.cookie.split('; ').find((row) => row.startsWith('accessToken='));
    setToken(match ? match.split('=')[1] : null);
  }, []);

  const realtime = useRealtimeUpdates(token);

  useEffect(() => {
    if (!token) {
      // No token means we cannot open a socket; treat as fallback.
      setStatus('disconnected');
      return;
    }

    const reported = (realtime as { status?: RealtimeConnectionStatus } | undefined)?.status;
    if (reported) {
      setStatus(reported);
      return;
    }

    const connected = (realtime as { isConnected?: boolean } | undefined)?.isConnected;
    if (typeof connected === 'boolean') {
      setStatus(connected ? 'connected' : 'connecting');
    }
  }, [token, realtime]);

  const value = useMemo<RealtimeContextValue>(() => {
    const isConnected = status === 'connected';
    return {
      status,
      isConnected,
      isFallback: !isConnected,
    };
  }, [status]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
</｜｜DSML｜｜ parameter>