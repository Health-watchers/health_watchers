'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const RealtimeProviderContent = dynamic(() => import('./RealtimeProviderContent'), { ssr: false });

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface RealtimeStatusContextValue {
  status: RealtimeConnectionStatus;
  isConnected: boolean;
}

const RealtimeStatusContext = createContext<RealtimeStatusContextValue>({
  status: 'connecting',
  isConnected: false,
});

export function useRealtimeStatus(): RealtimeStatusContextValue {
  return useContext(RealtimeStatusContext);
}

export function LazyRealtimeProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<RealtimeConnectionStatus>('connecting');

  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('accessToken='));
    setToken(match ? match.split('=')[1] : null);
  }, []);

  useEffect(() => {
    if (!token) {
      setStatus('disconnected');
    }
  }, [token]);

  const handleStatusChange = (nextStatus: RealtimeConnectionStatus) => {
    setStatus(nextStatus);
  };

  const contextValue: RealtimeStatusContextValue = {
    status,
    isConnected: status === 'connected',
  };

  return (
    <RealtimeStatusContext.Provider value={contextValue}>
      <RealtimeProviderContent token={token} onStatusChange={handleStatusChange}>
        {children}
      </RealtimeProviderContent>
    </RealtimeStatusContext.Provider>
  );
}

export default LazyRealtimeProvider;