'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { patientName, type UnbilledEncounter } from '@/lib/billing';
import { ClaimLineItemsEditor, validateLineItems, type LineItemDraft } from './ClaimLineItemsEditor';

export interface CreateClaimPayload {
  patientId: string;
  patientName: string;
  patientDob: string;
  serviceDate: string;
  clinicNpi: string;
  cptCodes: string[];
  diagnosisCodes: string[];
  amounts: number[];
}

const field =
  'w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';
const label = 'mb-1 block text-sm font-medium text-neutral-700';

export function CreateClaimForm({
  encounter,
  onSubmit,
  onCancel,
  isLoading,
  error,
}: {
  encounter: UnbilledEncounter;
  onSubmit: (payload: CreateClaimPayload) => void;
  onCancel: () => void;
  isLoading: boolean;
  error?: string;
}) {
  const patientId =
    typeof encounter.patientId === 'string' ? encounter.patientId : encounter.patientId._id;
  const [name, setName] = useState(
    patientName(encounter.patientId) === patientId ? '' : patientName(encounter.patientId)
  );
  const [dob, setDob] = useState('');
  const [npi, setNpi] = useState('');
  const [serviceDate, setServiceDate] = useState(encounter.createdAt.slice(0, 10));
  const [diagnoses, setDiagnoses] = useState(
    (encounter.diagnosis ?? []).map((d) => d.code).join(', ')
  );
  const [lines, setLines] = useState<LineItemDraft[]>(
    encounter.billing?.cptCodes?.length
      ? encounter.billing.cptCodes.map((c) => ({
          cptCode: c.code,
          amount: (Number(c.fee) * (c.units || 1)).toFixed(2),
        }))
      : [{ cptCode: '', amount: '' }]
  );
  const [formError, setFormError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const dx = diagnoses
      .split(',')
      .map((d) => d.trim().toUpperCase())
      .filter(Boolean);
    const problem =
      (!name.trim() && 'Patient name is required') ||
      (!dob && 'Date of birth is required') ||
      (!/^\d{10}$/.test(npi) && 'Billing NPI must be 10 digits') ||
      (dx.length === 0 && 'At least one ICD-10 diagnosis code is required') ||
      validateLineItems(lines);
    setFormError(problem || '');
    if (problem) return;

    onSubmit({
      patientId,
      patientName: name.trim(),
      patientDob: dob,
      serviceDate,
      clinicNpi: npi,
      diagnosisCodes: dx,
      cptCodes: lines.map((l) => l.cptCode.toUpperCase()),
      amounts: lines.map((l) => Number(l.amount)),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cc-name" className={label}>
            Patient name *
          </label>
          <input id="cc-name" className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cc-dob" className={label}>
            Date of birth *
          </label>
          <input
            id="cc-dob"
            type="date"
            className={field}
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cc-dos" className={label}>
            Date of service *
          </label>
          <input
            id="cc-dos"
            type="date"
            className={field}
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cc-npi" className={label}>
            Billing provider NPI *
          </label>
          <input
            id="cc-npi"
            inputMode="numeric"
            className={field}
            value={npi}
            onChange={(e) => setNpi(e.target.value.trim())}
          />
        </div>
      </div>
      <div>
        <label htmlFor="cc-dx" className={label}>
          ICD-10 diagnosis codes * <span className="font-normal text-neutral-500">(comma separated)</span>
        </label>
        <input
          id="cc-dx"
          className={field}
          value={diagnoses}
          onChange={(e) => setDiagnoses(e.target.value)}
        />
      </div>
      <fieldset>
        <legend className={label}>Line items *</legend>
        <ClaimLineItemsEditor items={lines} onChange={setLines} />
      </fieldset>
      {(formError || error) && (
        <p className="text-danger-600 text-sm" role="alert">
          {formError || error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isLoading}>
          Generate claim
        </Button>
      </div>
    </form>
  );
}
