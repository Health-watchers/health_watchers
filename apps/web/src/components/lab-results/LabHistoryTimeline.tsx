'use client';

import { useMemo } from 'react';
import { Badge, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { isCriticalFlag, toFindings } from '@/lib/lab-results/evaluation';
import { formatAnalyteValue } from '@/lib/lab-results/referenceRanges';
import type { LabFinding, LabResultSet, ResultSetStatus } from '@/lib/lab-results/types';

const STATUS_LABELS: Record<ResultSetStatus, string> = {
  final: 'Final',
  preliminary: 'Preliminary',
  corrected: 'Corrected',
};

interface PanelEntry {
  set: LabResultSet;
  findings: LabFinding[];
  abnormal: LabFinding[];
  critical: LabFinding[];
}

interface DayGroup {
  date: string;
  entries: PanelEntry[];
}

export interface LabHistoryTimelineProps {
  sets: readonly LabResultSet[];
  selectedSetId: string | null;
  onSelectSet: (setId: string) => void;
}

/**
 * Issue #1313 — result history timeline.
 * Groups reports by collection date and summarises what changed, so the whole
 * lab history can be scanned without opening every report.
 */
export function LabHistoryTimeline({
  sets,
  selectedSetId,
  onSelectSet,
}: LabHistoryTimelineProps) {
  const groups = useMemo<DayGroup[]>(() => {
    const byDate = new Map<string, DayGroup>();

    for (const set of sets) {
      const date = set.collectedAt.slice(0, 10);
      const findings = toFindings([set]);
      const abnormal = findings.filter((finding) => finding.flag !== 'normal');
      const critical = findings.filter((finding) => isCriticalFlag(finding.flag));

      const existing = byDate.get(date);
      const entry: PanelEntry = { set, findings, abnormal, critical };
      if (existing) existing.entries.push(entry);
      else byDate.set(date, { date, entries: [entry] });
    }

    return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [sets]);

  if (groups.length === 0) {
    return (
      <EmptyState
        title="No result history"
        description="Reports appear here as soon as the patient has results on file."
      />
    );
  }

  return (
    <ol className="space-y-6">
      {groups.map((group) => (
        <li key={group.date} className="border-l-2 border-neutral-200 pl-4 dark:border-neutral-700">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {formatDate(group.date)}
          </h3>
          <ul className="mt-2 space-y-3">
            {group.entries.map((entry) => (
              <li
                key={entry.set.id}
                className={[
                  'rounded-lg border p-3',
                  entry.critical.length > 0
                    ? 'border-danger-200 bg-danger-50 dark:border-danger-800 dark:bg-danger-900/20'
                    : 'border-neutral-200 dark:border-neutral-700',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {entry.set.panel}
                  </span>
                  <Badge variant={entry.set.status === 'corrected' ? 'warning' : 'default'}>
                    {STATUS_LABELS[entry.set.status]}
                  </Badge>
                  {entry.critical.length > 0 && (
                    <Badge variant="danger">
                      {entry.critical.length} critical
                    </Badge>
                  )}
                  {entry.abnormal.length > 0 && entry.critical.length === 0 && (
                    <Badge variant="warning">{entry.abnormal.length} outside range</Badge>
                  )}
                  {entry.abnormal.length === 0 && (
                    <Badge variant="success">All in range</Badge>
                  )}
                </div>

                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {entry.findings.length} test{entry.findings.length === 1 ? '' : 's'} · ordered by{' '}
                  {entry.set.orderedBy}
                </p>

                {entry.abnormal.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {entry.abnormal.map((finding) => (
                      <li key={finding.analyte} className="text-sm text-neutral-700 dark:text-neutral-300">
                        <span className="font-medium">{finding.name}</span>{' '}
                        {formatAnalyteValue(finding.definition, finding.value)} {finding.unit}{' '}
                        <span className="text-neutral-500 dark:text-neutral-400">
                          (reference {finding.referenceRange})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {entry.set.notes && (
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                    {entry.set.notes}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => onSelectSet(entry.set.id)}
                  aria-pressed={selectedSetId === entry.set.id}
                  className="text-primary-600 dark:text-primary-400 mt-2 text-xs hover:underline focus:outline-none focus-visible:underline"
                >
                  {selectedSetId === entry.set.id ? 'Selected for comparison' : 'Compare this report'}
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
