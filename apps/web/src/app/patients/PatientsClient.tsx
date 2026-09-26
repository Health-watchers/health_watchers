'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations, useFormatter } from 'next-intl';
import { type Patient } from '@health-watchers/types';
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
import { SearchTips } from '@/components/patients/SearchTips';
import { DuplicateDetectionWarning } from '@/components/patients/DuplicateDetectionWarning';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

function riskVariant(level?: RiskLevel) {
  if (level === 'critical') return 'danger';
  if (level === 'high') return 'danger';
  if (level === 'medium') return 'warning';
  if (level === 'low') return 'success';
  return 'default';
}

const DEFAULT_FILTERS: PatientFilters & {
  city?: string;
  ageMin?: string;
  ageMax?: string;
  medicalHistory?: string;
} = {
  q: '',
  status: '',
  sex: '',
  dobFrom: '',
  dobTo: '',
  condition: '',
  city: '',
  ageMin: '',
  ageMax: '',
  medicalHistory: '',
};

function calculateAgeFromDOB(dobString: string): number {
  const dob = new Date(dobString);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

function calculateDOBFromAge(age: number, isMax = false): string {
  const today = new Date();
  const year = today.getFullYear() - age;
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  if (isMax) {
    return `${year - 1}-12-31`;
  }
  return `${year}-01-01`;
}

export default function PatientsClient() {
  const t = useTranslations('patients');
  const tNew = useTranslations('patientNew');
  const tStatus = useTranslations('status');
  const format = useFormatter();
  const formatDob = (value?: string | Date) =>
    value ? format.dateTime(new Date(value), { dateStyle: 'medium', timeZone: 'UTC' }) : '';
  const formatSex = (sex?: string) =>
    sex && t.has(`filters.sexOptions.${sex}`) ? t(`filters.sexOptions.${sex}`) : (sex ?? '');
  const formatRisk = (level: RiskLevel) => (tStatus.has(level) ? tStatus(level) : level);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<typeof DEFAULT_FILTERS>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<typeof DEFAULT_FILTERS>(DEFAULT_FILTERS);
  const [inputValue, setInputValue] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout>();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    data: patients = [],
    isLoading,
    error,
  } = usePatients({
    ...appliedFilters,
    q: searchQuery,
  });

  useEffect(() => {
    const loadSearchHistory = () => {
      try {
        const history = localStorage.getItem('patientSearchHistory');
        if (history) {
          setSearchHistory(JSON.parse(history).slice(0, 10));
        }
      } catch {}
    };
    loadSearchHistory();
  }, []);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, []);

  const handleSearch = (value: string) => {
    setInputValue(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const trimmed = value.trim();
      setSearchQuery(trimmed);
      if (trimmed && trimmed.length > 2) {
        const newHistory = [trimmed, ...searchHistory.filter((h) => h !== trimmed)].slice(0, 10);
        setSearchHistory(newHistory);
        localStorage.setItem('patientSearchHistory', JSON.stringify(newHistory));
      }
    }, 300);
  };

  const exportToCSV = () => {
    if (patients.length === 0) return;

    const headers = [
      t('csv.id'),
      t('csv.firstName'),
      t('csv.lastName'),
      t('csv.dob'),
      t('csv.sex'),
      t('csv.contact'),
      t('csv.riskLevel'),
    ];
    const rows = patients.map((p: Patient & { riskLevel?: string }) => [
      p.systemId || '',
      p.firstName || '',
      p.lastName || '',
      formatDob(p.dateOfBirth),
      p.sex || '',
      p.contactNumber || '',
      p.riskLevel || '',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patients-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const applyFilters = () => {
    const newAppliedFilters = { ...filters };
    if (filters.ageMin) {
      newAppliedFilters.dobTo = calculateDOBFromAge(parseInt(filters.ageMin));
    }
    if (filters.ageMax) {
      newAppliedFilters.dobFrom = calculateDOBFromAge(parseInt(filters.ageMax), true);
    }
    setAppliedFilters(newAppliedFilters);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearchQuery('');
    setInputValue('');
    setAppliedFilters(DEFAULT_FILTERS);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (inputValue ? 1 : 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl dark:text-neutral-50">
          {t('title')}
        </h1>
        <div className="flex flex-wrap gap-2">
          {patients.length > 0 && (
            <Button
              onClick={exportToCSV}
              variant="outline"
              className="inline-flex items-center gap-2 text-sm"
            >
              📥 {t('exportCsv')}
            </Button>
          )}
          <Link
            href="/patients/new"
            id="register-new-patient-btn"
            className="bg-primary-600 hover:bg-primary-700 focus-visible:ring-primary-500 active:bg-primary-800 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <span aria-hidden="true">+</span>
            {tNew('title')}
          </Link>
        </div>
      </div>

      {patients.length > 0 && (
        <DuplicateDetectionWarning
          patients={patients.map((p) => ({
            ...p,
            matchScore: 0.8,
          }))}
        />
      )}

      <div className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
        <div className="p-5">
          <div className="mb-4">
            <label htmlFor="patient-search" className="sr-only">
              {t('search')}
            </label>
            <div className="relative">
              <input
                ref={searchInputRef}
                id="patient-search"
                type="search"
                value={inputValue}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => setShowSearchHistory(true)}
                onBlur={() => setTimeout(() => setShowSearchHistory(false), 200)}
                placeholder={t('searchPlaceholder')}
                className="focus:border-primary-400 focus:ring-primary-100 dark:focus:ring-primary-900/50 w-full rounded-md border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-700 placeholder-neutral-500 focus:ring-2 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-400"
                aria-label={t('search')}
              />
              <div className="absolute top-1/2 right-3 flex -translate-y-1/2 gap-2">
                <SearchTips />
                <span className="text-xs text-neutral-400">Ctrl+/</span>
              </div>
              {showSearchHistory && searchHistory.length > 0 && (
                <div className="absolute top-full right-0 left-0 mt-1 rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  <div className="p-2">
                    <p className="px-2 py-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {t('recentSearches')}
                    </p>
                    {searchHistory.map((query) => (
                      <button
                        key={query}
                        onClick={() => {
                          setInputValue(query);
                          handleSearch(query);
                          setShowSearchHistory(false);
                        }}
                        className="block w-full rounded px-2 py-1 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      >
                        🕐 {query}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            aria-expanded={showAdvancedFilters}
          >
            <span aria-hidden="true">{showAdvancedFilters ? '▼' : '▶'}</span>
            {t('filters.toggle')} {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>

          {showAdvancedFilters && (
            <div className="space-y-4 border-t border-gray-200 pt-4">
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label
                    htmlFor="filter-status"
                    className="block text-xs font-semibold text-gray-500 uppercase"
                  >
                    {t('filters.status')}
                  </label>
                  <select
                    id="filter-status"
                    value={filters.status}
                    onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
                  >
                    <option value="">{t('filters.allStatuses')}</option>
                    <option value="active">{tStatus('active')}</option>
                    <option value="inactive">{tStatus('inactive')}</option>
                    <option value="discharged">{tStatus('discharged')}</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="filter-sex"
                    className="block text-xs font-semibold text-gray-500 uppercase"
                  >
                    {t('filters.gender')}
                  </label>
                  <select
                    id="filter-sex"
                    value={filters.sex}
                    onChange={(e) => setFilters((prev) => ({ ...prev, sex: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
                  >
                    <option value="">{t('filters.all')}</option>
                    <option value="female">{t('filters.sexOptions.female')}</option>
                    <option value="male">{t('filters.sexOptions.male')}</option>
                    <option value="other">{t('filters.sexOptions.other')}</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="filter-city"
                    className="block text-xs font-semibold text-gray-500 uppercase"
                  >
                    {t('filters.city')}
                  </label>
                  <input
                    id="filter-city"
                    type="text"
                    value={filters.city}
                    onChange={(e) => setFilters((prev) => ({ ...prev, city: e.target.value }))}
                    placeholder={t('filters.cityPlaceholder')}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="filter-condition"
                    className="block text-xs font-semibold text-gray-500 uppercase"
                  >
                    {t('filters.condition')}
                  </label>
                  <input
                    id="filter-condition"
                    type="text"
                    value={filters.condition}
                    onChange={(e) => setFilters((prev) => ({ ...prev, condition: e.target.value }))}
                    placeholder={t('filters.conditionPlaceholder')}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="filter-medical-history"
                    className="block text-xs font-semibold text-gray-500 uppercase"
                  >
                    {t('filters.medicalHistory')}
                  </label>
                  <input
                    id="filter-medical-history"
                    type="text"
                    value={filters.medicalHistory}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, medicalHistory: e.target.value }))
                    }
                    placeholder={t('filters.medicalHistoryPlaceholder')}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:col-span-2">
                  <div>
                    <label
                      htmlFor="filter-age-min"
                      className="block text-xs font-semibold text-gray-500 uppercase"
                    >
                      {t('filters.ageMin')}
                    </label>
                    <input
                      id="filter-age-min"
                      type="number"
                      min="0"
                      max="150"
                      value={filters.ageMin}
                      onChange={(e) => setFilters((prev) => ({ ...prev, ageMin: e.target.value }))}
                      placeholder={t('filters.ageMinPlaceholder')}
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="filter-age-max"
                      className="block text-xs font-semibold text-gray-500 uppercase"
                    >
                      {t('filters.ageMax')}
                    </label>
                    <input
                      id="filter-age-max"
                      type="number"
                      min="0"
                      max="150"
                      value={filters.ageMax}
                      onChange={(e) => setFilters((prev) => ({ ...prev, ageMax: e.target.value }))}
                      placeholder={t('filters.ageMaxPlaceholder')}
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:col-span-2">
                  <div>
                    <label
                      htmlFor="filter-dob-from"
                      className="block text-xs font-semibold text-gray-500 uppercase"
                    >
                      {t('filters.dobFrom')}
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
                    <label
                      htmlFor="filter-dob-to"
                      className="block text-xs font-semibold text-gray-500 uppercase"
                    >
                      {t('filters.dobTo')}
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

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  variant="primary"
                  onClick={applyFilters}
                  className="rounded-md px-4 py-2 text-sm"
                >
                  {t('filters.apply')}
                </Button>
                <Button
                  variant="outline"
                  onClick={resetFilters}
                  className="rounded-md px-4 py-2 text-sm"
                >
                  {t('filters.clear')}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          {activeFilterCount > 0 && (
            <span className="text-sm text-gray-600">
              {t('filters.activeCount', { count: activeFilterCount })}
            </span>
          )}
          <p className="text-sm text-gray-500">{t('showingCount', { count: patients.length })}</p>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton columns={7} rows={5} />
      ) : error ? (
        <ErrorMessage
          message={error instanceof Error ? error.message : t('loadError')}
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
              {tNew('title')}
            </Link>
          }
        />
      ) : (
        <SectionErrorBoundary name="patient list">
          <div className="flex flex-col gap-4 md:hidden">
            {patients.map((p: Patient & { riskLevel?: RiskLevel; riskScore?: number }) => (
              <div key={p._id} className="rounded border border-gray-200 p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-3">
                  <PatientThumbnail
                    patientId={String(p._id)}
                    firstName={p.firstName}
                    lastName={p.lastName}
                    thumbnailUrl={(p as any).thumbnailUrl}
                    size="md"
                  />
                  <p className="font-medium text-gray-900">
                    {p.firstName} {p.lastName}
                  </p>
                </div>
                <p className="text-xs tracking-wide text-gray-500 uppercase">{t('id')}</p>
                <p className="font-medium text-gray-900">{p.systemId}</p>
                <p className="mt-2 text-xs tracking-wide text-gray-500 uppercase">{t('dob')}</p>
                <p className="text-gray-700">{formatDob(p.dateOfBirth)}</p>
                <p className="mt-2 text-xs tracking-wide text-gray-500 uppercase">{t('sex')}</p>
                <p className="text-gray-700">{formatSex(p.sex)}</p>
                <p className="mt-2 text-xs tracking-wide text-gray-500 uppercase">{t('contact')}</p>
                <p className="text-gray-700">{p.contactNumber || t('na')}</p>
                {p.riskLevel && (
                  <div className="mt-2">
                    <Badge variant={riskVariant(p.riskLevel)}>
                      {t('riskBadge', { level: formatRisk(p.riskLevel) })}
                    </Badge>
                  </div>
                )}
                <Link
                  href={`/patients/${p._id}`}
                  className="mt-3 inline-block rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                >
                  {t('view')}
                </Link>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table aria-label={t('title')} className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {t('id')}
                  </th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {t('photo')}
                  </th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {t('name')}
                  </th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {t('dob')}
                  </th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {t('sex')}
                  </th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {t('contact')}
                  </th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {t('risk')}
                  </th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {t('view')}
                  </th>
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
                    <td className="border border-gray-200 px-4 py-2">
                      {p.firstName} {p.lastName}
                    </td>
                    <td className="border border-gray-200 px-4 py-2">{formatDob(p.dateOfBirth)}</td>
                    <td className="border border-gray-200 px-4 py-2">{formatSex(p.sex)}</td>
                    <td className="border border-gray-200 px-4 py-2">
                      {p.contactNumber || t('na')}
                    </td>
                    <td className="border border-gray-200 px-4 py-2">
                      {p.riskLevel ? (
                        <Badge variant={riskVariant(p.riskLevel)}>
                          {formatRisk(p.riskLevel)}
                          {p.riskScore !== undefined ? ` (${p.riskScore})` : ''}
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="border border-gray-200 px-4 py-2">
                      <Link href={`/patients/${p._id}`} className="text-blue-600 hover:underline">
                        {t('view')}
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
