'use client';

import { useState, useCallback } from 'react';
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

type SortOption = 'createdAt_desc' | 'createdAt_asc' | 'patientName_asc';

interface Filters {
  q: string;
  status: string;
  diagnosisCode: string;
  dateFrom: string;
  dateTo: string;
  sort: SortOption;
}

const DEFAULT_FILTERS: Filters = {
  q: '',
  status: '',
  diagnosisCode: '',
  dateFrom: '',
  dateTo: '',
  sort: 'createdAt_desc',
};

export default function EncountersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS);

  const { data, isLoading, error } = useEncounters(page, 20, appliedFilters);
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

  const applyFilters = useCallback(() => {
    setPage(1);
    setAppliedFilters({ ...filters });
  }, [filters]);

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const hasActiveFilters = Object.entries(appliedFilters).some(
    ([k, v]) => k !== 'sort' && v !== '',
  );

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

      {/* Search & Filter Bar */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Full-text search */}
          <div className="xl:col-span-2">
            <label htmlFor="search-q" className="sr-only">Search encounters</label>
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                id="search-q"
                type="search"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                placeholder="Search chief complaint or notes…"
                className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Status filter */}
          <div>
            <label htmlFor="filter-status" className="sr-only">Filter by status</label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="follow-up">Follow-up</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Diagnosis code filter */}
          <div>
            <label htmlFor="filter-diagnosis" className="sr-only">Filter by ICD-10 code</label>
            <input
              id="filter-diagnosis"
              type="text"
              value={filters.diagnosisCode}
              onChange={(e) => setFilters((f) => ({ ...f, diagnosisCode: e.target.value }))}
              placeholder="ICD-10 code (e.g. I24.9)"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none"
            />
          </div>

          {/* Date from */}
          <div>
            <label htmlFor="filter-date-from" className="block text-xs font-medium text-gray-500 mb-1">
              From
            </label>
            <input
              id="filter-date-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
            />
          </div>

          {/* Date to */}
          <div>
            <label htmlFor="filter-date-to" className="block text-xs font-medium text-gray-500 mb-1">
              To
            </label>
            <input
              id="filter-date-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
            />
          </div>

          {/* Sort */}
          <div>
            <label htmlFor="filter-sort" className="sr-only">Sort by</label>
            <select
              id="filter-sort"
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortOption }))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
            >
              <option value="createdAt_desc">Newest first</option>
              <option value="createdAt_asc">Oldest first</option>
              <option value="patientName_asc">Patient name A–Z</option>
            </select>
          </div>
        </div>

        {/* Filter actions */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={applyFilters}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Apply Filters
          </button>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear Filters
            </button>
          )}
          {hasActiveFilters && (
            <span className="text-xs text-gray-500">
              {total} result{total !== 1 ? 's' : ''} found
            </span>
          )}
        </div>
      </div>

      {encounters.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-gray-900">No encounters found</h2>
          <p className="mt-2 text-sm text-gray-600">
            {hasActiveFilters
              ? 'Try adjusting your filters or clearing them to see all encounters.'
              : 'Create your first encounter to get started.'}
          </p>
          {!hasActiveFilters && (
            <Button variant="primary" size="md" className="mt-5" onClick={() => setShowForm(true)}>
              Create Encounter
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Patient', 'Chief Complaint', 'Diagnosis', 'Status', 'Doctor', 'Date'].map((h) => (
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
                    <td className="px-4 py-3">
                      {e.patient ? (
                        <div>
                          <div className="font-medium text-gray-900">
                            {e.patient.firstName} {e.patient.lastName}
                          </div>
                          {e.patient.systemId && (
                            <div className="text-xs text-gray-500">{e.patient.systemId}</div>
                          )}
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-gray-600">{e.patientId}</span>
                      )}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-gray-900">{e.chiefComplaint}</td>
                    <td className="px-4 py-3">
                      {e.diagnosis && e.diagnosis.length > 0 ? (
                        <span className="font-mono text-xs text-gray-600">
                          {e.diagnosis[0].code}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
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
