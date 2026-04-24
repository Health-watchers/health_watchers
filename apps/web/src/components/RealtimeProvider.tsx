'use client';

import { useEffect, useState } from 'react';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';

/** Reads the accessToken cookie on the client and activates real-time updates. */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Parse the accessToken from document.cookie
    const match = document.cookie.split('; ').find((row) => row.startsWith('accessToken='));
    setToken(match ? match.split('=')[1] : null);
  }, []);

  useRealtimeUpdates(token);

  return <>{children}</>;
}
