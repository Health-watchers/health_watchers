'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorMessage, Toast, TableSkeleton, Button } from '@/components/ui';
import {
  CreateEncounterForm,
  type CreateEncounterData,
} from '@/components/forms/CreateEncounterForm';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_URL } from '@/lib/api';

const API = `${API_URL}/api/v1`;

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

  const { data: encounters = [], isLoading, error } = useEncounters();

  const handleCreate = async (data: CreateEncounterData) => {
    const res = await fetchWithAuth(`${API}/encounters`, {
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
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{labels.title}</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Encounter
        </button>
      </div>

      {showForm && (
        <div className="mb-8 rounded-lg border border-gray-200 p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">New Encounter</h2>
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
        <ul aria-label={labels.title} className="m-0 flex list-none flex-col gap-4 p-0">
          {encounters.map((e: Encounter) => (
            <li key={e.id} className="rounded border border-gray-200 p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs tracking-wide text-gray-500 uppercase">{labels.id}</p>
                  <p className="font-medium break-all text-gray-900">{e.id}</p>
                </div>
                <div>
                  <p className="text-xs tracking-wide text-gray-500 uppercase">{labels.patient}</p>
                  <p className="font-medium break-all text-gray-900">{e.patientId}</p>
                </div>
                <div>
                  <p className="text-xs tracking-wide text-gray-500 uppercase">{labels.date}</p>
                  <p className="text-gray-700">{e.date}</p>
                </div>
                <div>
                  <p className="text-xs tracking-wide text-gray-500 uppercase">{labels.notes}</p>
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
