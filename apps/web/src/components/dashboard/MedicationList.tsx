'use client';

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  prescribedDate: string;
  hasInteractions: boolean;
  interactionWarning?: string;
}

interface MedicationListProps {
  medications: Medication[];
  loading?: boolean;
}

export function MedicationList({ medications, loading }: MedicationListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
        ))}
      </div>
    );
  }

  if (medications.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-neutral-700 dark:bg-neutral-800">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No active medications</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {medications.map((med) => (
        <div
          key={med.id}
          className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <div className="flex-1">
            <h4 className="font-medium text-neutral-900 dark:text-neutral-50">{med.name}</h4>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {med.dosage} • {med.frequency}
            </p>
            {med.hasInteractions && med.interactionWarning && (
              <p className="mt-2 text-xs text-danger-600 dark:text-danger-400">
                ⚠️ {med.interactionWarning}
              </p>
            )}
          </div>
          {med.hasInteractions && (
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-danger-100 dark:bg-danger-900/30">
              <span className="text-lg">⚠️</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
