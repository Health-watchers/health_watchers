'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { type Patient, formatDate } from '@health-watchers/types';
import {
  ErrorMessage,
  TableSkeleton,
  ModuleEmptyState,
  Badge,
  SectionErrorBoundary,
  Button,
} from '@/components/ui';
import PatientThumbnail from '@/components/patients/PatientThumbnail';
import PatientImport from '@/components/patients/PatientImport';
import { usePatients, type PatientFilters } from '@/lib/queries/usePatients';

interface Labels {
  title: string;
  loading: string;
  empty: string;
  id: string;
  name: string;
  dob: string;
  sex: string;
  contact: string;
  search: string;
  view: string;
  registerNew: string;
}

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

function riskVariant(level?: RiskLevel) {
  if (level === 'critical') return 'danger';
  if (level === 'high') return 'danger';
  if (level === 'medium') return 'warning';
  if (level === 'low') return 'success';
  return 'default';
}

const DEFAULT_FILTERS: PatientFilters = {
  q: '',
  status: '',
  sex: '',
  dobFrom: '',
  dobTo: '',
  condition: '',
};

export default function PatientsClient({ labels }: { labels: Labels }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<PatientFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<PatientFilters>(DEFAULT_FILTERS);
  const [inputValue, setInputValue] = useState('');
  const debounceTimer = useRef<NodeJS.Timeout>();

  const { data: patients = [], isLoading, error } = usePatients({
    ...appliedFilters,
    q: searchQuery,
  });

  const handleSearch = (value: string) => {
    setInputValue(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setSearchQuery(value.trim()), 300);
  };

  const applyFilters = () => {
    setAppliedFilters(filters);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearchQuery('');
    setInputValue('');
    setAppliedFilters(DEFAULT_FILTERS);
  };

  const activeFilterCount = Object.values(appliedFilters).filter(Boolean).length + (searchQuery ? 1 : 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{labels.title}</h1>
        <Link
          href="/patients/new"
          id="register-new-patient-btn"
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none active:bg-blue-800"
        >
          <span aria-hidden="true">+</span>
          {labels.registerNew}
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <label htmlFor="patient-search" className="sr-only">
              {labels.search}
            </label>
            <div className="relative">
              <input
                id="patient-search"
                type="search"
                value={inputValue}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={`${labels.search} / medical condition`}
                className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-sm text-gray-700 placeholder-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                aria-label={labels.search}
              />
            </div>
          </div>

          <div>
            <label htmlFor="filter-status" className="block text-xs font-semibold text-gray-500 uppercase">
              Status
            </label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="discharged">Discharged</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-sex" className="block text-xs font-semibold text-gray-500 uppercase">
              Sex
            </label>
            <select
              id="filter-sex"
              value={filters.sex}
              onChange={(e) => setFilters((prev) => ({ ...prev, sex: e.target.value }))}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
            >
              <option value="">All</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-condition" className="block text-xs font-semibold text-gray-500 uppercase">
              Medical condition
            </label>
            <input
              id="filter-condition"
              type="text"
              value={filters.condition}
              onChange={(e) => setFilters((prev) => ({ ...prev, condition: e.target.value }))}
              placeholder="e.g. hypertension"
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:col-span-2">
            <div>
              <label htmlFor="filter-dob-from" className="block text-xs font-semibold text-gray-500 uppercase">
                DOB from
              </label>
              <input
                id="filter-dob-from"
                type="date"
                value={filters.dobFrom}
                onChange={(e) => setFilters((prev) => ({ ...prev, dobFrom: e.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="filter-dob-to" className="block text-xs font-semibold text-gray-500 uppercase">
                DOB to
              </label>
              <input
                id="filter-dob-to"
                type="date"
                value={filters.dobTo}
                onChange={(e) => setFilters((prev) => ({ ...prev, dobTo: e.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={applyFilters} className="rounded-md px-4 py-2 text-sm">
              Apply filters
            </Button>
            <Button variant="outline" onClick={resetFilters} className="rounded-md px-4 py-2 text-sm">
              Clear filters
            </Button>
            {activeFilterCount > 0 && (
              <span className="text-sm text-gray-600">
                {activeFilterCount} active filter{activeFilterCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Showing {patients.length} patient{patients.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton columns={7} rows={5} />
      ) : error ? (
        <ErrorMessage
          message={error instanceof Error ? error.message : 'Failed to load patients.'}
          onRetry={() => window.location.reload()}
        />
      ) : patients.length === 0 ? (
        <ModuleEmptyState
          module="patients"
          action={
            <Link
              href="/patients/new"
              id="register-new-patient-empty-btn"
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <span aria-hidden="true">+</span>
              {labels.registerNew}
            </Link>
          }
        />
      ) : (
        <SectionErrorBoundary name="patient list">
          <div className="flex flex-col gap-4 md:hidden">
            {patients.map((p: Patient & { riskLevel?: RiskLevel; riskScore?: number }) => (
              <div key={p._id} className="rounded border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <PatientThumbnail
                    patientId={String(p._id)}
                    firstName={p.firstName}
                    lastName={p.lastName}
                    thumbnailUrl={(p as any).thumbnailUrl}
                    size="md"
                  />
                  <p className="font-medium text-gray-900">{p.firstName} {p.lastName}</p>
                </div>
                <p className="text-xs tracking-wide text-gray-500 uppercase">{labels.id}</p>
                <p className="font-medium text-gray-900">{p.systemId}</p>
                <p className="mt-2 text-xs tracking-wide text-gray-500 uppercase">{labels.dob}</p>
                <p className="text-gray-700">{formatDate(p.dateOfBirth)}</p>
                <p className="mt-2 text-xs tracking-wide text-gray-500 uppercase">{labels.sex}</p>
                <p className="text-gray-700">{p.sex}</p>
                <p className="mt-2 text-xs tracking-wide text-gray-500 uppercase">{labels.contact}</p>
                <p className="text-gray-700">{p.contactNumber || 'N/A'}</p>
                {p.riskLevel && (
                  <div className="mt-2">
                    <Badge variant={riskVariant(p.riskLevel)}>{p.riskLevel} risk</Badge>
                  </div>
                )}
                <Link
                  href={`/patients/${p._id}`}
                  className="mt-3 inline-block rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                >
                  {labels.view}
                </Link>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table aria-label={labels.title} className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">{labels.id}</th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">Photo</th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">{labels.name}</th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">{labels.dob}</th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">{labels.sex}</th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">{labels.contact}</th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">Risk</th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">{labels.view}</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p: Patient & { riskLevel?: RiskLevel; riskScore?: number }) => (
                  <tr key={p._id} className="even:bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2">{p.systemId}</td>
                    <td className="border border-gray-200 px-4 py-2">
                      <PatientThumbnail
                        patientId={String(p._id)}
                        firstName={p.firstName}
                        lastName={p.lastName}
                        thumbnailUrl={(p as any).thumbnailUrl}
                        size="sm"
                      />
                    </td>
                    <td className="border border-gray-200 px-4 py-2">{p.firstName} {p.lastName}</td>
                    <td className="border border-gray-200 px-4 py-2">{formatDate(p.dateOfBirth)}</td>
                    <td className="border border-gray-200 px-4 py-2">{p.sex}</td>
                    <td className="border border-gray-200 px-4 py-2">{p.contactNumber || 'N/A'}</td>
                    <td className="border border-gray-200 px-4 py-2">
                      {p.riskLevel ? (
                        <Badge variant={riskVariant(p.riskLevel)}>
                          {p.riskLevel}{p.riskScore !== undefined ? ` (${p.riskScore})` : ''}
                        </Badge>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="border border-gray-200 px-4 py-2">
                      <Link href={`/patients/${p._id}`} className="text-blue-600 hover:underline">
                        {labels.view}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionErrorBoundary>
      )}
    </main>
  );
}
