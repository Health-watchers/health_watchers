import { Suspense } from 'react';
import { Metadata } from 'next';
import AuditLogExplorerClient from './AuditLogExplorerClient';

export const metadata: Metadata = {
  title: 'Audit Log Explorer',
  description: 'Investigate access to patient records and other audited events.',
};

export default function AuditLogsPage() {
  // useSearchParams (URL-synced filters) requires a Suspense boundary
  return (
    <Suspense>
      <AuditLogExplorerClient />
    </Suspense>
  );
}
