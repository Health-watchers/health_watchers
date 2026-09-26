'use client';

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
import { formatAnalyteValue } from '@/lib/lab-results/referenceRanges';
import type {
  AnalyteKey,
  LabFinding,
  ResultFlag,
  ResultSetStatus,
} from '@/lib/lab-results/types';

export const FLAG_LABELS: Record<ResultFlag, string> = {
  normal: 'Normal',
  low: 'Low',
  high: 'High',
  critical_low: 'Critically low',
  critical_high: 'Critically high',
};

const STATUS_LABELS: Record<ResultSetStatus, string> = {
  final: 'Final',
  preliminary: 'Preliminary',
  corrected: 'Corrected',
};

export function flagBadgeVariant(flag: ResultFlag): 'success' | 'warning' | 'danger' {
  if (flag === 'normal') return 'success';
  if (flag === 'low' || flag === 'high') return 'warning';
  return 'danger';
}

export interface LabResultsTableProps {
  findings: readonly LabFinding[];
  selectedAnalyte: AnalyteKey | null;
  onSelectAnalyte: (analyte: AnalyteKey) => void;
}

/**
 * Issue #1313 — results table view.
 * Reference range indicators sit beside every value, and critical values are
 * highlighted in the row as well as badged so they are never missed.
 */
export function LabResultsTable({
  findings,
  selectedAnalyte,
  onSelectAnalyte,
}: LabResultsTableProps) {
  if (findings.length === 0) {
    return (
      <EmptyState
        title="No results match these filters"
        description="Clear the search box or widen the date range to see more of the patient's results."
      />
    );
  }

  return (
    <Table aria-label="Lab results">
      <TableHead>
        <TableRow>
          <TableTh>Collected</TableTh>
          <TableTh>Panel</TableTh>
          <TableTh>Test</TableTh>
          <TableTh>Result</TableTh>
          <TableTh>Reference range</TableTh>
          <TableTh>Flag</TableTh>
          <TableTh>Status</TableTh>
          <TableTh>
            <span className="sr-only">Actions</span>
          </TableTh>
        </TableRow>
      </TableHead>
      <TableBody>
        {findings.map((finding) => (
          <TableRow
            key={`${finding.setId}-${finding.analyte}`}
            className={
              finding.isCritical ? 'bg-danger-50 dark:bg-danger-900/30' : ''
            }
          >
            <TableTd>{formatDate(finding.collectedAt)}</TableTd>
            <TableTd>{finding.panel}</TableTd>
            <TableTd>
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {finding.name}
              </span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                {finding.shortName}
              </span>
            </TableTd>
            <TableTd>
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                {formatAnalyteValue(finding.definition, finding.value)}
              </span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                {finding.unit}
              </span>
            </TableTd>
            <TableTd>{finding.referenceRange}</TableTd>
            <TableTd>
              <Badge variant={flagBadgeVariant(finding.flag)}>{FLAG_LABELS[finding.flag]}</Badge>
            </TableTd>
            <TableTd>{STATUS_LABELS[finding.status]}</TableTd>
            <TableTd>
              <Button
                size="sm"
                variant="outline"
                aria-pressed={selectedAnalyte === finding.analyte}
                onClick={() => onSelectAnalyte(finding.analyte)}
              >
                Trend
              </Button>
            </TableTd>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
