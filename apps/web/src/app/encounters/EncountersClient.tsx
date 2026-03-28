'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorMessage, Toast, TableSkeleton, Button } from '@/components/ui';
import {
  CreateEncounterForm,
  type CreateEncounterData,
} from '@/components/forms/CreateEncounterForm';
import { queryKeys } from '@/lib/queryKeys';

const API = 'http://localhost:3001/api/v1';

interface Encounter {
  id: string;
  patientId: string;
  date: string;
  notes: string;
}

interface Labels {
  title: string;
  loading: string;
  empty: string;
  id: string;
  patient: string;
  date: string;
  notes: string;
}

function getEncounterErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Unable to load encounters right now.';
  if (error.message.includes('Failed to fetch')) {
    return 'Unable to reach the server. Please check your connection and try again.';
  }
  if (error.message.startsWith('Request failed')) {
    return 'Unable to load encounters right now. Please try again.';
  }
  return error.message;
}

export default function EncountersClient({ labels }: { labels: Labels }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const {
    data: encounters = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.encounters.list(),
    queryFn: async () => {
      const res = await fetch(`${API}/encounters`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      return data.data || data || [];
    },
  });

  const handleCreate = async (data: CreateEncounterData) => {
    const res = await fetch(`${API}/encounters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Error ${res.status}`);
    }
    setShowForm(false);
    setToast({ message: 'Encounter created successfully.', type: 'success' });
    queryClient.invalidateQueries({ queryKey: queryKeys.encounters.list() });
  };

  if (isLoading) return <TableSkeleton columns={6} rows={5} />;
  if (error)
    return (
      <ErrorMessage
        message={getEncounterErrorMessage(error)}
        onRetry={() =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.encounters.list(),
          })
        }
      />
    );

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{labels.title}</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Encounter
        </button>
      </div>

      {showForm && (
        <div className="mb-8 rounded-lg border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">New Encounter</h2>
          <CreateEncounterForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {encounters.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-gray-900">No records found</h2>
          <p className="mt-2 text-sm text-gray-600">{labels.empty}</p>
          <Button variant="primary" size="md" className="mt-5" onClick={() => setShowForm(true)}>
            Create Encounter
          </Button>
        </div>
      ) : (
        <ul aria-label={labels.title} className="flex flex-col gap-4 list-none p-0 m-0">
          {encounters.map((e: Encounter) => (
            <li key={e.id} className="rounded border border-gray-200 p-4 shadow-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{labels.id}</p>
                  <p className="font-medium text-gray-900 break-all">{e.id}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{labels.patient}</p>
                  <p className="font-medium text-gray-900 break-all">{e.patientId}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{labels.date}</p>
                  <p className="text-gray-700">{e.date}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{labels.notes}</p>
                  <p className="text-gray-700">{e.notes}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
