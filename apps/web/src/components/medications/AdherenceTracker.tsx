'use client';

import { useMemo } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TableTd,
  TableTh,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { ADHERENCE_LABELS, FREQUENCY_LABELS, adherenceBadgeVariant } from '@/lib/medications/labels';
import { computeAdherence } from '@/lib/medications/adherence';
import type { AdherenceCategory, AdherenceDose, Medication } from '@/lib/medications/types';

export interface AdherenceTrackerProps {
  medication: Medication;
  doses: readonly AdherenceDose[];
  isSubmitting: boolean;
  /** Records the patient-reported number of doses taken on a given day. */
  onLogDose: (date: string, taken: number) => void;
}

const BAR_COLOURS: Record<AdherenceCategory, string> = {
  excellent: 'bg-success-500',
  good: 'bg-primary-500',
  fair: 'bg-warning-500',
  poor: 'bg-danger-500',
};

function dayCategory(scheduled: number, taken: number): AdherenceCategory {
  if (scheduled === 0) return 'excellent';
  const rate = Math.round((taken / scheduled) * 100);
  if (rate >= 95) return 'excellent';
  if (rate >= 85) return 'good';
  if (rate >= 70) return 'fair';
  return 'poor';
}

/** Issue #1314 — medication adherence tracking. */
export function AdherenceTracker({
  medication,
  doses,
  isSubmitting,
  onLogDose,
}: AdherenceTrackerProps) {
  const summary = useMemo(() => computeAdherence(doses), [doses]);
  const ordered = useMemo(
    () => doses.slice().sort((a, b) => a.date.localeCompare(b.date)),
    [doses]
  );

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {medication.drugName} {medication.dosage}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {FREQUENCY_LABELS[medication.frequency]} · last {doses.length} days
            </p>
          </div>
          <Badge variant={adherenceBadgeVariant(summary.category)}>
            {ADHERENCE_LABELS[summary.category]} · {summary.rate}%
          </Badge>
        </div>

        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"
          role="img"
          aria-label={`Adherence ${summary.rate} percent`}
        >
          <div
            className={['h-full rounded-full', BAR_COLOURS[summary.category]].join(' ')}
            style={{ width: `${summary.rate}%` }}
          />
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
          <div>
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Doses due</dt>
            <dd className="font-semibold text-neutral-900 dark:text-neutral-100">
              {summary.scheduled}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Taken</dt>
            <dd className="font-semibold text-neutral-900 dark:text-neutral-100">
              {summary.taken}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Missed</dt>
            <dd className="text-danger-600 dark:text-danger-400 font-semibold">
              {summary.missed}
            </dd>
          </div>
        </dl>
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          title="No adherence data"
          description="Once doses are logged, adherence percentages and the daily breakdown appear here."
        />
      ) : (
        <Table aria-label={`Adherence for ${medication.drugName}`}>
          <TableHead>
            <TableRow>
              <TableTh>Date</TableTh>
              <TableTh>Due</TableTh>
              <TableTh>Taken</TableTh>
              <TableTh>Day rating</TableTh>
              <TableTh>Action</TableTh>
            </TableRow>
          </TableHead>
          <TableBody>
            {ordered.map((dose) => {
              const category = dayCategory(dose.scheduled, dose.taken);
              return (
                <TableRow key={dose.date}>
                  <TableTd>{formatDate(dose.date)}</TableTd>
                  <TableTd>{dose.scheduled}</TableTd>
                  <TableTd>{dose.taken}</TableTd>
                  <TableTd>
                    <span
                      className={['inline-block h-3 w-3 rounded-full', BAR_COLOURS[category]].join(
                        ' '
                      )}
                      aria-hidden="true"
                    />
                    <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {dose.scheduled === 0 ? 'Not scheduled' : ADHERENCE_LABELS[category]}
                    </span>
                  </TableTd>
                  <TableTd>
                    {dose.scheduled > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSubmitting}
                        onClick={() =>
                          onLogDose(dose.date, dose.taken >= dose.scheduled ? 0 : dose.scheduled)
                        }
                      >
                        {dose.taken >= dose.scheduled ? 'Undo' : 'Mark taken'}
                      </Button>
                    )}
                  </TableTd>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {summary.scheduled === 0 && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          This medication is prescribed as needed, so no doses are scheduled for tracking.
        </p>
      )}
    </div>
  );
}
