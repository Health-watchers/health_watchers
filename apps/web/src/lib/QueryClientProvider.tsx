'use client';

import {
  QueryClient,
  QueryClientProvider as TanStackQueryClientProvider,
} from '@tanstack/react-query';
import { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function QueryClientProvider({ children }: { children: ReactNode }) {
  return <TanStackQueryClientProvider client={queryClient}>{children}</TanStackQueryClientProvider>;
}

export { queryClient };
