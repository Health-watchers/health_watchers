'use client';

import { useState, useEffect } from 'react';
import { PageWrapper, PageHeader, Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import ApiKeyManager from '@/components/settings/ApiKeyManager';

export default function SettingsPage() {
  return (
    <PageWrapper className="py-8">
      <PageHeader title="Settings" subtitle="Manage your clinic integrations and API access" />
      <ApiKeyManager />
    </PageWrapper>
  );
}
