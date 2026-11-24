'use client';

import { Badge, Button, EmptyState, Table, TableBody, TableHead, TableRow, TableTd, TableTh } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { FREQUENCY_LABELS, ROUTE_LABELS, STATUS_LABELS, statusBadgeVariant } from '@/lib/medications/labels';
import type { InteractionCheck, Medication } from '@/lib/medications/types';

export interface MedicationListProps {
  medications: readonly Medication[];
  /** Regimen-level interaction findings, used to flag affected rows. */
  interactions: readonly InteractionCheck[];
  onDiscontinue: (medication: Medication) => void;
  onViewHistory: (medication: Medication) => void;
  onRequestRefill: (medication: Medication) => void;
}

export function MedicationList({
  medications,
  interactions,
  onDiscontinue,
  onViewHistory,
  onRequestRefill,
}: MedicationListProps) {
  if (medications.length === 0) {
    return (
      <EmptyState
        title="No medications recorded"
        description="No prescriptions match the current filters. Add a medication to start the list."
      />
    );
  }

  const flagged = new Set(interactions.map((check) => check.medicationId));

  return (
    <Table aria-label="Patient medications">
      <TableHead>
        <TableRow>
          <TableTh>Medication</TableTh>
          <TableTh>Dose &amp; frequency</TableTh>
          <TableTh>Status</TableTh>
          <TableTh>Started</TableTh>
          <TableTh>Refills</TableTh>
          <TableTh>Actions</TableTh>
        </TableRow>
      </TableHead>
      <TableBody>
        {medications.map((medication) => (
          <TableRow key={medication.id}>
            <TableTd>
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {medication.drugName}
              </span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                {medication.genericName} · {medication.drugClass}
              </span>
              {medication.indication && (
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  For: {medication.indication}
                </span>
              )}
              {flagged.has(medication.id) && (
                <span className="text-danger-600 dark:text-danger-400 mt-1 block text-xs font-medium">
                  Interaction flagged — review before dispensing
                </span>
              )}
            </TableTd>
            <TableTd>
              <span className="block font-medium">{medication.dosage}</span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                {FREQUENCY_LABELS[medication.frequency]} · {ROUTE_LABELS[medication.route]}
              </span>
            </TableTd>
            <TableTd>
              <Badge variant={statusBadgeVariant(medication.status)}>
                {STATUS_LABELS[medication.status]}
              </Badge>
            </TableTd>
            <TableTd>
              <span className="block">{formatDate(medication.startDate)}</span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                {medication.lastFilledAt
                  ? `Last filled ${formatDate(medication.lastFilledAt)}`
                  : 'Not yet dispensed'}
              </span>
            </TableTd>
            <TableTd>
              <span className="block font-medium">{medication.refillsRemaining} left</span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                Qty {medication.quantity}
              </span>
            </TableTd>
            <TableTd>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onViewHistory(medication)}>
                  History
                </Button>
                <Button size="sm" variant="outline" onClick={() => onRequestRefill(medication)}>
                  Refill
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => onDiscontinue(medication)}
                  disabled={medication.status === 'discontinued' || medication.status === 'completed'}
                >
                  Discontinue
                </Button>
              </div>
            </TableTd>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
