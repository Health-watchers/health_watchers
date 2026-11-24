'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  EmptyState,
  Select,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TableTd,
  TableTh,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { ReferenceRangeIndicator } from './ReferenceRangeIndicator';
import { FLAG_LABELS, flagBadgeVariant } from './LabResultsTable';
import {
  compareResultSets,
  resultSetOptions,
  sortSetsNewestFirst,
} from '@/lib/lab-results/evaluation';
import { getAnalyteDefinition, formatAnalyteValue } from '@/lib/lab-results/referenceRanges';
import type { LabResultSet, TrendDirection } from '@/lib/lab-results/types';

const DIRECTION_LABELS: Record<TrendDirection, string> = {
  rising: 'Rising',
  falling: 'Falling',
  stable: 'No material change',
};

function changeClasses(direction: TrendDirection): string {
  if (direction === 'rising') return 'text-danger-600 dark:text-danger-400';
  if (direction === 'falling') return 'text-primary-600 dark:text-primary-400';
  return 'text-neutral-500';
}

export interface ResultsComparisonProps {
  sets: readonly LabResultSet[];
  /** When set, this report is pre-selected as the "current" report. */
  focusSetId: string | null;
}

/**
 * Issue #1313 — results comparison.
 * Deltas two reports analyte by analyte so a change is obvious at a glance,
 * with the current value shown against its reference range.
 */
export function ResultsComparison({ sets, focusSetId }: ResultsComparisonProps) {
  const ordered = useMemo(() => sortSetsNewestFirst(sets), [sets]);
  const [currentId, setCurrentId] = useState(ordered[0]?.id ?? '');
  const [previousId, setPreviousId] = useState(ordered[1]?.id ?? '');

  useEffect(() => {
    setCurrentId(ordered[0]?.id ?? '');
    setPreviousId(ordered[1]?.id ?? '');
  }, [ordered]);

  useEffect(() => {
    if (!focusSetId) return;
    setCurrentId(focusSetId);
    setPreviousId((current) =>
      current === focusSetId
        ? ordered.find((set) => set.id !== focusSetId)?.id ?? ''
        : current
    );
  }, [focusSetId, ordered]);

  const options = useMemo(() => resultSetOptions(ordered), [ordered]);
  const current = ordered.find((set) => set.id === currentId) ?? null;
  const previous = ordered.find((set) => set.id === previousId) ?? null;
  const rows = useMemo(() => compareResultSets(previous, current), [previous, current]);

  if (ordered.length < 2) {
    return (
      <EmptyState
        title="Two reports are needed"
        description="Comparison becomes available once this patient has at least two reported panels."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Current report"
          options={options}
          value={currentId}
          onChange={(event) => setCurrentId(event.target.value)}
        />
        <Select
          label="Compare with"
          options={options}
          value={previousId}
          onChange={(event) => setPreviousId(event.target.value)}
        />
      </div>

      {current && previous && current.panel !== previous.panel && (
        <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
          Comparing {current.panel} against {previous.panel}. Only analytes present in both
          reports are shown.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No comparable analytes"
          description="These two reports share no analytes, so there is nothing to compare."
        />
      ) : (
        <Table aria-label="Result comparison">
          <TableHead>
            <TableRow>
              <TableTh>Analyte</TableTh>
              <TableTh>Previous</TableTh>
              <TableTh>Change</TableTh>
              <TableTh>Current</TableTh>
              <TableTh>Against reference range</TableTh>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const definition = getAnalyteDefinition(row.analyte);
              return (
                <TableRow key={row.analyte}>
                  <TableTd>
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">
                      {row.name}
                    </span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                      {row.currentFlag === 'normal' ? 'In range' : FLAG_LABELS[row.currentFlag]}
                    </span>
                  </TableTd>
                  <TableTd>
                    {formatAnalyteValue(definition, row.previous)} {row.unit}
                    <Badge variant={flagBadgeVariant(row.previousFlag)} className="ml-2">
                      {FLAG_LABELS[row.previousFlag]}
                    </Badge>
                  </TableTd>
                  <TableTd>
                    <span className={['font-semibold', changeClasses(row.direction)].join(' ')}>
                      {row.change > 0 ? '+' : ''}
                      {formatAnalyteValue(definition, row.change)} {row.unit}
                    </span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                      {DIRECTION_LABELS[row.direction]}
                      {row.percentChange !== 0 ? ` · ${row.percentChange}%` : ''}
                    </span>
                  </TableTd>
                  <TableTd>
                    {formatAnalyteValue(definition, row.current)} {row.unit}
                    <Badge variant={flagBadgeVariant(row.currentFlag)} className="ml-2">
                      {FLAG_LABELS[row.currentFlag]}
                    </Badge>
                  </TableTd>
                  <TableTd className="min-w-[16rem]">
                    <ReferenceRangeIndicator
                      definition={definition}
                      value={row.current}
                      flag={row.currentFlag}
                    />
                  </TableTd>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {current && previous && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Current report collected {formatDate(current.collectedAt)}, compared with{' '}
          {formatDate(previous.collectedAt)}.
        </p>
      )}
    </div>
  );
}
