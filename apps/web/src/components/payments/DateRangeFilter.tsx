'use client';

import type { DatePreset, GroupBy, DateRange } from '@/hooks/usePaymentAnalytics';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DateRangeFilterProps {
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
  groupBy: GroupBy;
  onGroupByChange: (g: GroupBy) => void;
  customRange: DateRange;
  onCustomRangeChange: (r: DateRange) => void;
  /** Optional clinic ID filter (for SUPER_ADMIN) */
  clinicId?: string;
  onClinicIdChange?: (id: string) => void;
  showClinicFilter?: boolean;
}

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'custom', label: 'Custom' },
];

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function DateRangeFilter({
  preset,
  onPresetChange,
  groupBy,
  onGroupByChange,
  customRange,
  onCustomRangeChange,
  clinicId,
  onClinicIdChange,
  showClinicFilter = false,
}: DateRangeFilterProps) {
  return (
    <div
      role="group"
      aria-label="Analytics date range and grouping filters"
      className="flex flex-wrap items-center gap-2"
    >
      {/* Preset buttons */}
      <fieldset>
        <legend className="sr-only">Date preset</legend>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onPresetChange(p.value)}
              aria-pressed={preset === p.value}
              className={[
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:outline-none',
                preset === p.value
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Custom date range */}
      {preset === 'custom' && (
        <div
          className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-1 text-sm"
          role="group"
          aria-label="Custom date range"
        >
          <label htmlFor="analytics-from" className="sr-only">
            Start date
          </label>
          <input
            id="analytics-from"
            type="date"
            value={customRange.from}
            max={customRange.to}
            onChange={(e) => onCustomRangeChange({ ...customRange, from: e.target.value })}
            className="border-0 bg-transparent text-sm text-neutral-700 focus:ring-0 focus:outline-none"
          />
          <span className="text-neutral-400" aria-hidden="true">
            →
          </span>
          <label htmlFor="analytics-to" className="sr-only">
            End date
          </label>
          <input
            id="analytics-to"
            type="date"
            value={customRange.to}
            min={customRange.from}
            onChange={(e) => onCustomRangeChange({ ...customRange, to: e.target.value })}
            className="border-0 bg-transparent text-sm text-neutral-700 focus:ring-0 focus:outline-none"
          />
        </div>
      )}

      {/* Group by selector */}
      <div>
        <label htmlFor="analytics-groupby" className="sr-only">
          Group by
        </label>
        <select
          id="analytics-groupby"
          value={groupBy}
          onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          {GROUP_BY_OPTIONS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      {/* Clinic ID (SUPER_ADMIN only) */}
      {showClinicFilter && onClinicIdChange && (
        <div>
          <label htmlFor="analytics-clinic" className="sr-only">
            Clinic ID (admin only)
          </label>
          <input
            id="analytics-clinic"
            type="text"
            placeholder="Clinic ID (admin)"
            value={clinicId ?? ''}
            onChange={(e) => onClinicIdChange(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
