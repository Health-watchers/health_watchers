'use client';

import { useState } from 'react';
import { Badge, Button, EmptyState, Input, Select, Textarea } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { REFILL_STATUS_LABELS, refillBadgeVariant } from '@/lib/medications/labels';
import type { Medication, RefillRequest, RefillStatus } from '@/lib/medications/types';

export interface NewRefillRequest {
  medicationId: string;
  medicationName: string;
  pharmacy: string;
  notes: string;
}

export interface RefillRequestsProps {
  requests: readonly RefillRequest[];
  /** Medications eligible for a refill (active or on hold). */
  medications: readonly Medication[];
  isSubmitting: boolean;
  onRequest: (request: NewRefillRequest) => void;
  onUpdateStatus: (requestId: string, status: RefillStatus) => void;
}

const PHARMACIES = [
  'Meadow Community Pharmacy',
  'HealthWatchers Clinic Pharmacy',
  'Central Care Chemists',
  'Riverside Pharmacy',
];

/** Issue #1314 — medication refill requests. */
export function RefillRequests({
  requests,
  medications,
  isSubmitting,
  onRequest,
  onUpdateStatus,
}: RefillRequestsProps) {
  const eligible = medications.filter(
    (medication) => medication.status === 'active' || medication.status === 'on_hold'
  );
  const medicationOptions = eligible.map((medication) => ({
    value: medication.id,
    label: `${medication.drugName} ${medication.dosage} · ${medication.refillsRemaining} refills left`,
  }));

  const [medicationId, setMedicationId] = useState('');
  const [pharmacy, setPharmacy] = useState(PHARMACIES[0] ?? '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const medication = eligible.find((item) => item.id === medicationId);
    if (!medication) {
      setError('Select the medication that needs a refill.');
      return;
    }
    if (!pharmacy.trim()) {
      setError('Enter the dispensing pharmacy.');
      return;
    }
    setError(null);
    onRequest({
      medicationId: medication.id,
      medicationName: medication.drugName,
      pharmacy: pharmacy.trim(),
      notes: notes.trim(),
    });
    setMedicationId('');
    setNotes('');
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4" aria-label="Request a refill">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Medication *"
            placeholder="Select a medication"
            options={medicationOptions}
            value={medicationId}
            onChange={(event) => setMedicationId(event.target.value)}
          />
          <div>
            <Input
              label="Pharmacy *"
              value={pharmacy}
              onChange={(event) => setPharmacy(event.target.value)}
              list="refill-pharmacies"
            />
            <datalist id="refill-pharmacies">
              {PHARMACIES.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
        </div>
        <Textarea
          label="Notes for the pharmacy"
          rows={2}
          placeholder="e.g. Patient ran out; next review is Friday."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        {error && (
          <p role="alert" className="text-danger-600 dark:text-danger-400 text-sm">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" loading={isSubmitting} disabled={eligible.length === 0}>
            Request refill
          </Button>
        </div>
      </form>

      {requests.length === 0 ? (
        <EmptyState
          title="No refill requests"
          description="Refill requests raised by the clinic or the patient will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li
              key={request.id}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={refillBadgeVariant(request.status)}>
                  {REFILL_STATUS_LABELS[request.status]}
                </Badge>
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {request.medicationName}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Requested {formatDateTime(request.requestedAt)} by {request.requestedBy}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Pharmacy: {request.pharmacy}
              </p>
              {request.notes && (
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  {request.notes}
                </p>
              )}
              {request.status === 'pending' && (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => onUpdateStatus(request.id, 'approved')}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onUpdateStatus(request.id, 'denied')}
                  >
                    Deny
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
