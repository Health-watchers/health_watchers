'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const RealtimeProviderContent = dynamic(() => import('./RealtimeProviderContent'), { ssr: false });

export function LazyRealtimeProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('accessToken='));
    setToken(match ? match.split('=')[1] : null);
  }, []);

  return <RealtimeProviderContent token={token}>{children}</RealtimeProviderContent>;
}

export default LazyRealtimeProvider;
