'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface Medication {
  id: string;
  name: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  prescriber?: string;
  instructions?: string;
}

interface DrugInteraction {
  id?: string;
  severity?: string;
  description?: string;
  medicationIds?: string[];
  medicationNames?: string[];
}

interface MedicationsTabProps {
  patientId: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  contraindicated: 'bg-red-100 text-red-800 border-red-300',
  severe: 'bg-red-100 text-red-800 border-red-300',
  major: 'bg-red-100 text-red-800 border-red-300',
  moderate: 'bg-amber-100 text-amber-800 border-amber-300',
  minor: 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

function severityClass(severity?: string): string {
  if (!severity) {
    return 'bg-gray-100 text-gray-800 border-gray-300';
  }
  return (
    SEVERITY_STYLES[severity.toLowerCase()] ??
    'bg-gray-100 text-gray-800 border-gray-300'
  );
}

function formatDate(value?: string): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
}

function isActive(medication: Medication): boolean {
  if (medication.status) {
    return medication.status.toLowerCase() === 'active';
  }
  if (medication.endDate) {
    const end = new Date(medication.endDate);
    if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) {
      return false;
    }
  }
  return true;
}

export default function MedicationsTab({ patientId }: MedicationsTabProps) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [interactions, setInteractions] = useState<DrugInteraction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState<boolean>(false);

  const loadMedications = useCallback(async () => {
    if (!patientId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/patients/${encodeURIComponent(patientId)}/medications`,
        { headers: { Accept: 'application/json' } },
      );
      if (!response.ok) {
        throw new Error(`Failed to load medications (${response.status})`);
      }
      const data = await response.json();
      const list: Medication[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.medications)
          ? data.medications
          : [];
      const interactionList: DrugInteraction[] = Array.isArray(data?.interactions)
        ? data.interactions
        : [];
      setMedications(list);
      setInteractions(interactionList);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load medications',
      );
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void loadMedications();
  }, [loadMedications]);

  const activeMedications = useMemo(
    () => medications.filter(isActive),
    [medications],
  );

  const displayedMedications = useMemo(
    () => (showInactive ? medications : activeMedications),
    [showInactive, medications, activeMedications],
  );

  const interactionMedicationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const interaction of interactions) {
      for (const id of interaction.medicationIds ?? []) {
        ids.add(id);
      }
    }
    return ids;
  }, [interactions]);

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500" role="status">
        Loading medications…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6" role="alert">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => void loadMedications()}
          className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Medications</h2>
          <p className="text-sm text-gray-500">
            {activeMedications.length} active medication
            {activeMedications.length === 1 ? '' : 's'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Show inactive
        </label>
      </div>

      {interactions.length > 0 && (
        <section
          aria-label="Drug interaction warnings"
          className="rounded-lg border border-red-200 bg-red-50 p-4"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-red-800">
            <span aria-hidden="true">⚠</span>
            Drug Interaction Warnings ({interactions.length})
          </h3>
          <ul className="mt-3 space-y-2">
            {interactions.map((interaction, index) => (
              <li
                key={interaction.id ?? `interaction-${index}`}
                className={`rounded-md border p-3 text-sm ${severityClass(
                  interaction.severity,
                )}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide">
                    {interaction.severity ?? 'unknown'}
                  </span>
                  {interaction.medicationNames &&
                    interaction.medicationNames.length > 0 && (
                      <span className="font-medium">
                        {interaction.medicationNames.join(' + ')}
                      </span>
                    )}
                </div>
                {interaction.description && (
                  <p className="mt-1">{interaction.description}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {displayedMedications.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          No medications recorded for this patient.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  Medication
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  Dosage
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  Frequency
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  Route
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  Start
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  End
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {displayedMedications.map((medication) => {
                const hasInteraction = interactionMedicationIds.has(
                  medication.id,
                );
                return (
                  <tr
                    key={medication.id}
                    className={hasInteraction ? 'bg-red-50' : undefined}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {medication.name}
                        </span>
                        {hasInteraction && (
                          <span
                            className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700"
                            title="This medication is involved in a drug interaction"
                          >
                            Interaction
                          </span>
                        )}
                      </div>
                      {medication.instructions && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {medication.instructions}
                        </p>
                      )}
                      {medication.prescriber && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          Prescriber: {medication.prescriber}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {medication.dosage ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {medication.frequency ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {medication.route ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          isActive(medication)
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {medication.status ?? (isActive(medication) ? 'Active' : 'Inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatDate(medication.startDate)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatDate(medication.endDate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}