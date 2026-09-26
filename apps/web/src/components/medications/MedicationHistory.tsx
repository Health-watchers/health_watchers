'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, EmptyState, Select } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { HISTORY_EVENT_LABELS } from '@/lib/medications/labels';
import type { HistoryEventType, MedicationHistoryEvent } from '@/lib/medications/types';

export interface MedicationHistoryProps {
  events: readonly MedicationHistoryEvent[];
  /** Medication to focus on, or `null` for the whole regimen. */
  focusMedicationId: string | null;
}

const TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All events' },
  ...(Object.keys(HISTORY_EVENT_LABELS) as HistoryEventType[]).map((type) => ({
    value: type,
    label: HISTORY_EVENT_LABELS[type],
  })),
];

function eventBadgeVariant(type: HistoryEventType): 'danger' | 'warning' | 'success' | 'default' {
  if (type === 'discontinued') return 'danger';
  if (type === 'side_effect_reported') return 'warning';
  if (type === 'created') return 'success';
  return 'default';
}

/**
 * Issue #1314 — medication history view.
 * Full audit trail of starts, dose changes, refills, side effects and
 * discontinuations, newest first, filterable by event type and medication.
 */
export function MedicationHistory({ events, focusMedicationId }: MedicationHistoryProps) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [medicationFilter, setMedicationFilter] = useState(focusMedicationId ?? 'all');

  useEffect(() => {
    if (focusMedicationId) setMedicationFilter(focusMedicationId);
  }, [focusMedicationId]);

  const medicationOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const event of events) names.set(event.medicationId, event.medicationName);
    return [
      { value: 'all', label: 'All medications' },
      ...Array.from(names, ([value, label]) => ({ value, label })),
    ];
  }, [events]);

  const filtered = useMemo(() => {
    return events
      .filter((event) => typeFilter === 'all' || event.type === typeFilter)
      .filter((event) => medicationFilter === 'all' || event.medicationId === medicationFilter)
      .slice()
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [events, typeFilter, medicationFilter]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-xl">
        <Select
          label="Event type"
          options={TYPE_FILTER_OPTIONS}
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
        />
        <Select
          label="Medication"
          options={medicationOptions}
          value={medicationFilter}
          onChange={(event) => setMedicationFilter(event.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No history for this filter"
          description="Adjust the filters to see the medication audit trail."
        />
      ) : (
        <ol className="space-y-3">
          {filtered.map((event) => (
            <li
              key={event.id}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={eventBadgeVariant(event.type)}>
                  {HISTORY_EVENT_LABELS[event.type]}
                </Badge>
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {event.medicationName}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {formatDateTime(event.at)}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                {event.summary}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Recorded by {event.actor}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
