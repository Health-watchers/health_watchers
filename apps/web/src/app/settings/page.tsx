import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui';

// ── Lazy-load heavy settings components ───────────────────────────────────────
// SettingsClient and ClinicSettingsClient are loaded eagerly (they render
// immediately above the fold). The heavier management panels — ApiKeyManager
// and WebhookManager — are deferred so they don't inflate the initial JS bundle.

import SettingsClient from './SettingsClient';
import ClinicSettingsClient from './ClinicSettingsClient';

const ApiKeyManager = dynamic(() => import('@/components/settings/ApiKeyManager'), {
  loading: () => <Skeleton className="h-64 w-full rounded-lg" />,
  ssr: false,
});

const WebhookManager = dynamic(() => import('@/components/settings/WebhookManager'), {
  loading: () => <Skeleton className="h-64 w-full rounded-lg" />,
  ssr: false,
});

export default function SettingsPage() {
  return (
    <>
      <SettingsClient />
      <ClinicSettingsClient />
      <ApiKeyManager />
      <WebhookManager />
    </>
  );
}
