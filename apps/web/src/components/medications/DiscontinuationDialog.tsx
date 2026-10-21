'use client';

import { useEffect, useState } from 'react';
import { Button, Modal, Select, Textarea } from '@/components/ui';
import { FREQUENCY_LABELS } from '@/lib/medications/labels';
import type { Medication } from '@/lib/medications/types';

export interface DiscontinuationDialogProps {
  /** Medication being discontinued, or `null` when the dialog is closed. */
  medication: Medication | null;
  isSubmitting: boolean;
  onConfirm: (medicationId: string, reason: string, notes: string) => void;
  onClose: () => void;
}

const REASON_OPTIONS = [
  { value: 'interaction', label: 'Interaction — safety concern' },
  { value: 'adverse_effect', label: 'Adverse effect' },
  { value: 'no_longer_needed', label: 'No longer needed' },
  { value: 'therapy_completed', label: 'Course completed' },
  { value: 'switched', label: 'Switched to an alternative' },
  { value: 'patient_request', label: 'Patient request' },
  { value: 'other', label: 'Other' },
];

/**
 * Issue #1314 — discontinuation workflow.
 * Captures a structured reason plus free-text notes so the medication history
 * records why and by whom the therapy was stopped.
 */
export function DiscontinuationDialog({
  medication,
  isSubmitting,
  onConfirm,
  onClose,
}: DiscontinuationDialogProps) {
  const [reason, setReason] = useState('interaction');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (medication) {
      setReason('interaction');
      setNotes('');
      setError(null);
    }
  }, [medication]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!medication) return;
    if (!reason) {
      setError('Select a discontinuation reason.');
      return;
    }
    setError(null);
    const label = REASON_OPTIONS.find((option) => option.value === reason)?.label ?? reason;
    onConfirm(medication.id, label, notes.trim());
  };

  return (
    <Modal open={medication !== null} onClose={onClose} title="Discontinue medication" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {medication && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {medication.drugName} {medication.dosage} ·{' '}
            {FREQUENCY_LABELS[medication.frequency]}
          </p>
        )}
        <Select
          label="Reason *"
          options={REASON_OPTIONS}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <Textarea
          label="Clinical notes"
          rows={3}
          placeholder="Document the rationale, alternatives offered and follow-up plan."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Discontinuing keeps the medication in the history, stops it from being exported to the
          pharmacy and cancels any outstanding refills.
        </p>

        {error && (
          <p role="alert" className="text-danger-600 dark:text-danger-400 text-sm">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Keep active
          </Button>
          <Button type="submit" variant="danger" loading={isSubmitting}>
            Discontinue
          </Button>
        </div>
      </form>
    </Modal>
  );
}
