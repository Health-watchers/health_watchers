'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorMessage, Toast, TableSkeleton, Button } from '@/components/ui';
import {
  CreateEncounterForm,
  type CreateEncounterData,
} from '@/components/forms/CreateEncounterForm';
import { queryKeys } from '@/lib/queryKeys';
import { useEncounters } from '@/lib/queries/useEncounters';
import { API_URL } from '@/lib/api';

const API = `${API_URL}/api/v1`;

function getEncounterErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Unable to load encounters right now.';
  if (error.message.includes('Failed to fetch')) {
    return 'Unable to reach the server. Please check your connection and try again.';
  }
  return error.message;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-700',
  'follow-up': 'bg-blue-100 text-blue-800',
  cancelled: 'bg-red-100 text-red-700',
};

export default function EncountersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data, isLoading, error } = useEncounters(page);
  const encounters = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const limit = data?.meta?.limit ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleCreate = async (formData: CreateEncounterData) => {
    const res = await fetch(`${API}/encounters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Error ${res.status}`);
    }
    setShowForm(false);
    setToast({ message: 'Encounter created successfully.', type: 'success' });
    queryClient.invalidateQueries({ queryKey: queryKeys.encounters.list() });
  };

  if (isLoading) return <TableSkeleton columns={5} rows={8} />;
  if (error)
    return (
      <ErrorMessage
        message={getEncounterErrorMessage(error)}
        onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.encounters.list() })}
      />
    );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Encounters</h1>
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
          <h2 className="text-lg font-semibold text-gray-900">No encounters found</h2>
          <p className="mt-2 text-sm text-gray-600">Create your first encounter to get started.</p>
          <Button variant="primary" size="md" className="mt-5" onClick={() => setShowForm(true)}>
            Create Encounter
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Patient', 'Chief Complaint', 'Status', 'Doctor', 'Date'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {encounters.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{e.patientId}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-gray-900">{e.chiefComplaint}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[e.status] ?? 'bg-gray-100 text-gray-700'}`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{e.attendingDoctorId}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>
              Page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
