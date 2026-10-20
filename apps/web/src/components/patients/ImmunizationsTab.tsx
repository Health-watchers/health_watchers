'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface ImmunizationRecord {
  id: string;
  patientId: string;
  vaccineName: string;
  cvxCode?: string;
  manufacturer?: string;
  lotNumber?: string;
  doseNumber?: number;
  seriesDoses?: number;
  administeredAt: string;
  administeredBy?: string;
  site?: string;
  route?: string;
  status: 'completed' | 'scheduled' | 'declined' | 'overdue';
  notes?: string;
}

interface ImmunizationsTabProps {
  patientId: string;
}

type StatusFilter = 'all' | ImmunizationRecord['status'];

const STATUS_LABELS: Record<ImmunizationRecord['status'], string> = {
  completed: 'Completed',
  scheduled: 'Scheduled',
  declined: 'Declined',
  overdue: 'Overdue',
};

const STATUS_STYLES: Record<ImmunizationRecord['status'], string> = {
  completed: 'bg-green-100 text-green-800',
  scheduled: 'bg-blue-100 text-blue-800',
  declined: 'bg-gray-100 text-gray-800',
  overdue: 'bg-red-100 text-red-800',
};

async function fetchImmunizations(patientId: string): Promise<ImmunizationRecord[]> {
  const res = await fetch(
    `/api/immunizations?patientId=${encodeURIComponent(patientId)}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) {
    throw new Error(`Failed to load immunizations (${res.status})`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data?.data ?? [];
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ImmunizationsTab({ patientId }: ImmunizationsTabProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const {
    data: immunizations = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ImmunizationRecord[], Error>({
    queryKey: ['immunizations', patientId],
    queryFn: () => fetchImmunizations(patientId),
    enabled: Boolean(patientId),
    staleTime: 60_000,
  });

  const sorted = useMemo(() => {
    return [...immunizations].sort(
      (a, b) =>
        new Date(b.administeredAt).getTime() - new Date(a.administeredAt).getTime(),
    );
  }, [immunizations]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sorted.filter((record) => {
      if (statusFilter !== 'all' && record.status !== statusFilter) return false;
      if (!term) return true;
      return (
        record.vaccineName.toLowerCase().includes(term) ||
        (record.manufacturer ?? '').toLowerCase().includes(term) ||
        (record.lotNumber ?? '').toLowerCase().includes(term)
      );
    });
  }, [sorted, statusFilter, search]);

  const counts = useMemo(() => {
    const base: Record<StatusFilter, number> = {
      all: sorted.length,
      completed: 0,
      scheduled: 0,
      declined: 0,
      overdue: 0,
    };
    for (const record of sorted) {
      base[record.status] += 1;
    }
    return base;
  }, [sorted]);

  if (isLoading) {
    return (
      <div className="p-6" role="status" aria-live="polite">
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-48 rounded bg-gray-200" />
          <div className="h-10 w-full rounded bg-gray-100" />
          <div className="h-10 w-full rounded bg-gray-100" />
          <div className="h-10 w-full rounded bg-gray-100" />
        </div>
        <span className="sr-only">Loading immunizations…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6" role="alert">
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            Unable to load immunizations.
          </p>
          <p className="mt-1 text-sm text-red-700">
            {error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Immunizations</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="immunization-search" className="sr-only">
            Search immunizations
          </label>
          <input
            id="immunization-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vaccine, manufacturer, lot…"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-64"
          />
          <label htmlFor="immunization-status" className="sr-only">
            Filter by status
          </label>
          <select
            id="immunization-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All ({counts.all})</option>
            <option value="completed">Completed ({counts.completed})</option>
            <option value="scheduled">Scheduled ({counts.scheduled})</option>
            <option value="overdue">Overdue ({counts.overdue})</option>
            <option value="declined">Declined ({counts.declined})</option>
          </select>
        </div>
      </div>

      {counts.overdue > 0 && (
        <div
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          role="status"
        >
          {counts.overdue} immunization{counts.overdue === 1 ? '' : 's'} overdue.
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-600">
            {sorted.length === 0
              ? 'No immunization records found for this patient.'
              : 'No immunizations match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium text-gray-700">
                  Vaccine
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-gray-700">
                  Date
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-gray-700">
                  Dose
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-gray-700">
                  Manufacturer / Lot
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-gray-700">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{record.vaccineName}</div>
                    {record.cvxCode && (
                      <div className="text-xs text-gray-500">CVX {record.cvxCode}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    {formatDate(record.administeredAt)}
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    {record.doseNumber != null
                      ? record.seriesDoses != null
                        ? `${record.doseNumber} of ${record.seriesDoses}`
                        : `Dose ${record.doseNumber}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    <div>{record.manufacturer ?? '—'}</div>
                    {record.lotNumber && (
                      <div className="text-xs text-gray-500">Lot {record.lotNumber}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[record.status]}`}
                    >
                      {STATUS_LABELS[record.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}