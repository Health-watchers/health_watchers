'use client';

import { useState } from 'react';

export interface ReportFilters {
  dateRange: { from: string; to: string };
  provider?: string;
  clinicBranch?: string;
}

interface ReportFiltersProps {
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
  providers?: Array<{ id: string; name: string }>;
  branches?: Array<{ id: string; name: string }>;
}

export function ReportFiltersPanel({
  filters,
  onChange,
  providers = [],
  branches = [],
}: ReportFiltersProps) {
  return (
    <div
      role="search"
      aria-label="Report filters"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-from" className="text-xs font-medium text-neutral-700">
          From Date
        </label>
        <input
          id="filter-from"
          type="date"
          value={filters.dateRange.from}
          onChange={(e) =>
            onChange({ ...filters, dateRange: { ...filters.dateRange, from: e.target.value } })
          }
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-to" className="text-xs font-medium text-neutral-700">
          To Date
        </label>
        <input
          id="filter-to"
          type="date"
          value={filters.dateRange.to}
          onChange={(e) =>
            onChange({ ...filters, dateRange: { ...filters.dateRange, to: e.target.value } })
          }
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      {providers.length > 0 && (
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-provider" className="text-xs font-medium text-neutral-700">
            Provider
          </label>
          <select
            id="filter-provider"
            value={filters.provider || ''}
            onChange={(e) => onChange({ ...filters, provider: e.target.value || undefined })}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">All Providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {branches.length > 0 && (
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-branch" className="text-xs font-medium text-neutral-700">
            Clinic Branch
          </label>
          <select
            id="filter-branch"
            value={filters.clinicBranch || ''}
            onChange={(e) => onChange({ ...filters, clinicBranch: e.target.value || undefined })}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={() =>
          onChange({
            dateRange: { from: '', to: '' },
            provider: undefined,
            clinicBranch: undefined,
          })
        }
        className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        Clear Filters
      </button>
    </div>
  );
}
