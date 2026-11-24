'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations, useFormatter } from 'next-intl';
import { ErrorMessage, Toast, TableSkeleton, Button } from '@/components/ui';
import {
  CreateEncounterForm,
  type CreateEncounterData,
} from '@/components/forms/CreateEncounterForm';
import { queryKeys } from '@/lib/queryKeys';
import { useEncounters } from '@/lib/queries/useEncounters';
import { API_URL } from '@/lib/api';
import { fetchWithAuth } from '@/lib/auth';

const API = `${API_URL}/api/v1`;

function getEncounterErrorMessage(
  error: unknown,
  messages: { loadError: string; networkError: string }
): string {
  if (!(error instanceof Error)) return messages.loadError;
  if (error.message.includes('Failed to fetch')) return messages.networkError;
  return error.message;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  closed: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'follow-up': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
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
  const t = useTranslations('encounters');
  const tStatus = useTranslations('status');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; patientName: string } | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

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
    setToast({ message: t('created'), type: 'success' });
    queryClient.invalidateQueries({ queryKey: queryKeys.encounters.list() });
  };

  const handleDeleteEncounter = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`${API}/encounters/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      setToast({ message: 'Encounter removed successfully.', type: 'success' });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.encounters.list() });
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Unable to remove encounter.',
        type: 'error',
      });
    } finally {
      setDeleting(false);
    }
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
    ([k, v]) => k !== 'sort' && v !== ''
  );

  if (isLoading) return <TableSkeleton columns={5} rows={8} />;
  if (error)
    return (
      <ErrorMessage
        message={getEncounterErrorMessage(error, {
          loadError: t('loadError'),
          networkError: t('networkError'),
        })}
        onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.encounters.list() })}
      />
    );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-gray-100">
          {t('title')}
        </h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {t('newEncounter')}
        </button>
      </div>

      {showForm && (
        <div className="mb-8 rounded-lg border border-gray-200 p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('newEncounterTitle')}
          </h2>
          <CreateEncounterForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Full-text search */}
          <div className="xl:col-span-2">
            <label htmlFor="search-q" className="sr-only">
              {t('filters.searchLabel')}
              Search encounters
            </label>
            <div className="relative">
              <svg
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
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
                placeholder={t('filters.searchPlaceholder')}
                className="w-full rounded-md border border-gray-300 bg-white py-2 pr-3 pl-9 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:placeholder-gray-500"
              />
            </div>
          </div>

          {/* Status filter */}
          <div>
            <label htmlFor="filter-status" className="sr-only">
              {t('filters.statusLabel')}
              Filter by status
            </label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="">{t('allStatus')}</option>
              <option value="open">{tStatus('open')}</option>
              <option value="closed">{tStatus('closed')}</option>
              <option value="follow-up">{tStatus('follow-up')}</option>
              <option value="cancelled">{tStatus('cancelled')}</option>
            </select>
          </div>

          {/* Diagnosis code filter */}
          <div>
            <label htmlFor="filter-diagnosis" className="sr-only">
              {t('filters.diagnosisLabel')}
              Filter by ICD-10 code
            </label>
            <input
              id="filter-diagnosis"
              type="text"
              value={filters.diagnosisCode}
              onChange={(e) => setFilters((f) => ({ ...f, diagnosisCode: e.target.value }))}
              placeholder={t('filters.diagnosisPlaceholder')}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:placeholder-gray-500"
            />
          </div>

          {/* Date from */}
          <div>
            <label
              htmlFor="filter-date-from"
              className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400"
            >
              {t('filters.from')}
              From
            </label>
            <input
              id="filter-date-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
            />
          </div>

          {/* Date to */}
          <div>
            <label
              htmlFor="filter-date-to"
              className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400"
            >
              {t('filters.to')}
              To
            </label>
            <input
              id="filter-date-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
            />
          </div>

          {/* Sort */}
          <div>
            <label htmlFor="filter-sort" className="sr-only">
              {t('filters.sortLabel')}
              Sort by
            </label>
            <select
              id="filter-sort"
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortOption }))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="createdAt_desc">{t('filters.sortNewest')}</option>
              <option value="createdAt_asc">{t('filters.sortOldest')}</option>
              <option value="patientName_asc">{t('filters.sortPatientName')}</option>
            </select>
          </div>
        </div>

        {/* Filter actions */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={applyFilters}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {t('filters.apply')}
          </button>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {t('filters.clear')}
            </button>
          )}
          {hasActiveFilters && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t('filters.resultCount', { count: total })}
            </span>
          )}
        </div>
      </div>

      {encounters.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center dark:border-gray-600 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('empty')}</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {hasActiveFilters ? t('emptyFiltered') : t('emptyHint')}
          </p>
          {!hasActiveFilters && (
            <Button variant="primary" size="md" className="mt-5" onClick={() => setShowForm(true)}>
              {t('createEncounter')}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {[
                    t('patient'),
                    t('chiefComplaint'),
                    t('diagnosis'),
                    t('status'),
                    t('doctor'),
                    t('date'),
                    t('actions'),
                    'Patient',
                    'Chief Complaint',
                    'Diagnosis',
                    'Status',
                    'Doctor',
                    'Date',
                    'Actions',
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {encounters.map((e) => (
                  <tr
                    key={e.id}
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-4 py-3">
                      {e.patient ? (
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {e.patient.firstName} {e.patient.lastName}
                          </div>
                          {e.patient.systemId && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {e.patient.systemId}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                          {e.patientId}
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-gray-900 dark:text-gray-100">
                      {e.chiefComplaint}
                    </td>
                    <td className="px-4 py-3">
                      {e.diagnosis && e.diagnosis.length > 0 ? (
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                          {e.diagnosis[0].code}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[e.status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
                      >
                        {tStatus.has(e.status) ? tStatus(e.status) : e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {e.attendingDoctorId}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {e.createdAt
                        ? format.dateTime(new Date(e.createdAt), { dateStyle: 'medium' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/encounters/${e.id}`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {t('viewDetails')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>{t('pagination.summary', { page, totalPages, total })}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {t('pagination.previous')}
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {t('pagination.next')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Remove encounter confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={handleDeleteEncounter}
        title="Remove encounter"
        confirmLabel="Remove encounter"
        cancelLabel="Cancel"
        loading={deleting}
        message={
          deleteTarget ? (
            <>
              You are about to remove the encounter for <strong>{deleteTarget.patientName}</strong>.
              This will cancel the encounter and mark it as inactive. This action cannot be undone.
            </>
          ) : null
        }
      />
    </main>
  );
}
