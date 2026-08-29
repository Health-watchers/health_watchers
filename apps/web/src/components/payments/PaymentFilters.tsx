'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';

export type StatusFilter = 'all' | 'pending' | 'confirmed' | 'completed' | 'failed';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'failed', label: 'Failed' },
];

interface PaymentFiltersProps {
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
}

/**
 * Filter bar for the payments table.
 * Extracted from PaymentTable to keep filtering logic isolated and reusable.
 */
export function PaymentFilters({
  statusFilter,
  onStatusChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
}: PaymentFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Tabs value={statusFilter} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="ml-auto flex items-center gap-2">
        <label htmlFor="date-from" className="text-xs whitespace-nowrap text-neutral-500">
          From
        </label>
        <input
          id="date-from"
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="focus:ring-primary-500 rounded-md border border-neutral-200 px-2 py-1 text-sm text-neutral-700 focus:ring-2 focus:outline-none"
        />
        <label htmlFor="date-to" className="text-xs text-neutral-500">
          To
        </label>
        <input
          id="date-to"
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="focus:ring-primary-500 rounded-md border border-neutral-200 px-2 py-1 text-sm text-neutral-700 focus:ring-2 focus:outline-none"
        />
      </div>
    </div>
  );
}
