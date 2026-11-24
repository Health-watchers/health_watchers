'use client';

import { useState } from 'react';
import { Badge, Button, EmptyState, Table, TableBody, TableHead, TableRow, TableTd, TableTh } from '@/components/ui';
import { RECONCILIATION_LABELS, FREQUENCY_LABELS } from '@/lib/medications/labels';
import { unresolvedCount } from '@/lib/medications/reconciliation';
import type { ReconciliationEntry, ReconciliationStatus } from '@/lib/medications/types';

export interface ReconciliationViewProps {
  entries: readonly ReconciliationEntry[];
  isSubmitting: boolean;
  onResolve: (entryId: string, resolution: 'accepted' | 'dismissed') => void;
}

function statusBadgeVariant(status: ReconciliationStatus): 'success' | 'warning' | 'danger' {
  if (status === 'match') return 'success';
  if (status === 'dose_mismatch') return 'warning';
  return 'danger';
}

/** Issue #1314 — medication reconciliation against the patient's own list. */
export function ReconciliationView({ entries, isSubmitting, onResolve }: ReconciliationViewProps) {
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const outstanding = unresolvedCount(entries);

  const resolve = (entryId: string, resolution: 'accepted' | 'dismissed') => {
    setResolutions((current) => ({ ...current, [entryId]: resolution }));
    onResolve(entryId, resolution);
  };

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Nothing to reconcile"
        description="Add medications to the clinic list to compare them with what the patient reports taking."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400" role="status">
        {outstanding === 0
          ? 'All medications reconciled — no discrepancies outstanding.'
          : `${outstanding} discrepanc${outstanding === 1 ? 'y' : 'ies'} need review.`}
      </p>

      <Table aria-label="Medication reconciliation">
        <TableHead>
          <TableRow>
            <TableTh>Medication</TableTh>
            <TableTh>Dose</TableTh>
            <TableTh>Frequency</TableTh>
            <TableTh>Finding</TableTh>
            <TableTh>Action</TableTh>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((entry) => {
            const resolution = resolutions[entry.id];
            return (
              <TableRow key={entry.id}>
                <TableTd>
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">
                    {entry.drugName}
                  </span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                    {entry.source === 'clinic' ? 'Clinic list' : 'Patient reported'}
                  </span>
                </TableTd>
                <TableTd>{entry.dosage}</TableTd>
                <TableTd>{FREQUENCY_LABELS[entry.frequency]}</TableTd>
                <TableTd>
                  <Badge variant={statusBadgeVariant(entry.status)}>
                    {RECONCILIATION_LABELS[entry.status]}
                  </Badge>
                  <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                    {entry.note}
                  </span>
                </TableTd>
                <TableTd>
                  {entry.status === 'match' ? (
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      No action needed
                    </span>
                  ) : resolution ? (
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {resolution === 'accepted' ? 'Accepted' : 'Dismissed'}
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={isSubmitting}
                        onClick={() => resolve(entry.id, 'accepted')}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSubmitting}
                        onClick={() => resolve(entry.id, 'dismissed')}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </TableTd>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
