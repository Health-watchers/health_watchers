'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Toast, TableSkeleton, ErrorMessage, Button } from '@/components/ui';
import { useEncounter } from '@/lib/queries/useEncounter';
import EncounterDetail from '@/components/encounters/EncounterDetail';

interface EncounterPageProps {
  params: {
    id: string;
  };
}

export default function EncounterDetailPage({ params }: EncounterPageProps) {
  const router = useRouter();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { data, isLoading, error } = useEncounter(params.id);

  if (isLoading) return <TableSkeleton columns={4} rows={6} />;
  if (error)
    return (
      <ErrorMessage
        message={error instanceof Error ? error.message : 'Unable to load encounter details.'}
        onRetry={() => window.location.reload()}
      />
    );
  if (!data) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">Encounter not found.</p>
          <Button onClick={() => router.push('/encounters')} className="mt-4">
            Back to encounters
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">Encounter record — {data.id}</p>
          <h1 className="text-3xl font-semibold text-gray-900">{data.patientName}</h1>
        </div>
        <Button variant="outline" onClick={() => router.push('/encounters')}>
          Back to encounters
        </Button>
      </div>
      <EncounterDetail encounter={data} onBack={() => router.push('/encounters')} />
    </main>
  );
}
