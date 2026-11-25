import { RefObject } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui';
import { formatDate } from '@health-watchers/types';

export interface PatientHit {
  _id: string;
  systemId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

interface PatientSectionProps {
  selectedPatient: PatientHit | null;
  prefilledPatientId: string;
  patientQuery: string;
  patientHits: PatientHit[];
  patientSearching: boolean;
  error?: string;
  onQueryChange: (q: string) => void;
  onSelectPatient: (p: PatientHit) => void;
  onClearPatient: () => void;
}

export function PatientSection({
  selectedPatient,
  prefilledPatientId,
  patientQuery,
  patientHits,
  patientSearching,
  error,
  onQueryChange,
  onSelectPatient,
  onClearPatient,
}: PatientSectionProps) {
  return (
    <section aria-labelledby="section-patient">
      <h2
        id="section-patient"
        className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase"
      >
        Patient <span className="text-danger-500">*</span>
      </h2>

      {selectedPatient ? (
        <div className="border-primary-200 bg-primary-50 flex items-center justify-between rounded-lg border px-4 py-3">
          <div>
            <p className="font-medium text-neutral-900">
              {selectedPatient.firstName} {selectedPatient.lastName}
            </p>
            <p className="text-xs text-neutral-500">
              {selectedPatient.systemId} · DOB {formatDate(selectedPatient.dateOfBirth)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClearPatient}
            className="text-primary-600 focus-visible:ring-primary-500 rounded text-xs hover:underline focus:outline-none focus-visible:ring-2"
          >
            Change
          </button>
        </div>
      ) : prefilledPatientId ? (
        <p className="rounded-lg border border-neutral-200 px-4 py-3 text-sm text-neutral-600">
          Patient ID: <span className="font-mono">{prefilledPatientId}</span>
        </p>
      ) : (
        <div className="relative">
          <Input
            label="Search patient by name or ID"
            value={patientQuery}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Type to search…"
            aria-autocomplete="list"
            aria-controls="patient-listbox"
            aria-expanded={patientHits.length > 0}
            error={error}
            autoComplete="off"
          />
          {(patientSearching || patientHits.length > 0) && (
            <ul
              id="patient-listbox"
              role="listbox"
              aria-label="Patient suggestions"
              className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg"
            >
              {patientSearching && (
                <li className="px-4 py-2 text-sm text-neutral-400">Searching…</li>
              )}
              {patientHits.map((p) => (
                <li
                  key={p._id}
                  role="option"
                  aria-selected={false}
                  className="hover:bg-primary-50 focus:bg-primary-50 cursor-pointer px-4 py-2 text-sm outline-none"
                  tabIndex={0}
                  onClick={() => onSelectPatient(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSelectPatient(p);
                  }}
                >
                  <span className="font-medium">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="ml-2 text-xs text-neutral-400">
                    {p.systemId} · {formatDate(p.dateOfBirth)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
