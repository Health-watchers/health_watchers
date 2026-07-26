'use client';

import { useLazyRealtimeUpdates } from '@/hooks/useLazyRealtimeUpdates';

interface RealtimeProviderContentProps {
  token: string | null;
  children: React.ReactNode;
}

export default function RealtimeProviderContent({ token, children }: RealtimeProviderContentProps) {
  useLazyRealtimeUpdates(token);
  return <>{children}</>;
}
