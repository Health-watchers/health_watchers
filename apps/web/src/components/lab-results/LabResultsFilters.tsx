'use client';

import { Button, Input, SearchInput, Select } from '@/components/ui';
import { PANEL_OPTIONS } from '@/lib/lab-results/referenceRanges';
import type { LabPanel, LabResultsFilters, ResultSetStatus } from '@/lib/lab-results/types';

export const PANEL_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All panels' },
  ...PANEL_OPTIONS,
];

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'final', label: 'Final' },
  { value: 'preliminary', label: 'Preliminary' },
  { value: 'corrected', label: 'Corrected' },
];

export const EMPTY_LAB_FILTERS: LabResultsFilters = {
  query: '',
  panel: 'all',
  status: 'all',
  dateFrom: '',
  dateTo: '',
  onlyAbnormal: false,
  onlyCritical: false,
};

export interface LabResultsFiltersProps {
  filters: LabResultsFilters;
  resultCount: number;
  onChange: (next: LabResultsFilters) => void;
  onReset: () => void;
}

/** Issue #1313 — result search, facet filters and date range. */
export function LabResultsFilters({
  filters,
  resultCount,
  onChange,
  onReset,
}: LabResultsFiltersProps) {
  const update = (patch: Partial<LabResultsFilters>) => onChange({ ...filters, ...patch });

  return (
    <section aria-label="Filter lab results" className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <label
            htmlFor="lab-results-search"
            className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Search results
          </label>
          <SearchInput
            id="lab-results-search"
            placeholder="Test, panel or clinician…"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
            onClear={() => update({ query: '' })}
          />
        </div>
        <Select
          label="Panel"
          options={PANEL_FILTER_OPTIONS}
          value={filters.panel}
          onChange={(event) => update({ panel: event.target.value as LabPanel | 'all' })}
        />
        <Select
          label="Status"
          options={STATUS_FILTER_OPTIONS}
          value={filters.status}
          onChange={(event) => update({ status: event.target.value as ResultSetStatus | 'all' })}
        />
        <Input
          label="Collected from"
          type="date"
          value={filters.dateFrom}
          onChange={(event) => update({ dateFrom: event.target.value })}
        />
        <Input
          label="Collected to"
          type="date"
          value={filters.dateTo}
          onChange={(event) => update({ dateTo: event.target.value })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-neutral-300"
            checked={filters.onlyAbnormal}
            onChange={(event) => update({ onlyAbnormal: event.target.checked })}
          />
          Abnormal results only
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-neutral-300"
            checked={filters.onlyCritical}
            onChange={(event) => update({ onlyCritical: event.target.checked })}
          />
          Critical results only
        </label>
        <Button size="sm" variant="outline" onClick={onReset}>
          Clear filters
        </Button>
        <p role="status" className="text-sm text-neutral-500 dark:text-neutral-400">
          {resultCount} result{resultCount === 1 ? '' : 's'}
        </p>
      </div>
    </section>
  );
}
