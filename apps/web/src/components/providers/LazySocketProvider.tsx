'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const SocketProvider = dynamic(() => import('./SocketProvider'), { ssr: false });

export function LazySocketProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return <SocketProvider>{children}</SocketProvider>;
}

export default LazySocketProvider;
