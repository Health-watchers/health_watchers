import { Button } from '@/components/ui';

export interface PrescriptionRow {
  id: number;
  drugName: string;
  dosage: string;
  frequency: string;
  route: string;
  duration: string;
}

interface PrescriptionSectionProps {
  prescriptions: PrescriptionRow[];
  onAdd: () => void;
  onRemove: (id: number) => void;
  onUpdate: (id: number, field: keyof PrescriptionRow, value: string) => void;
  onOpenDosageCalculator: (id: number) => void;
}

export function PrescriptionSection({
  prescriptions,
  onAdd,
  onRemove,
  onUpdate,
  onOpenDosageCalculator,
}: PrescriptionSectionProps) {
  return (
    <section aria-labelledby="section-rx">
      <div className="mb-3 flex items-center justify-between">
        <h2
          id="section-rx"
          className="text-sm font-semibold tracking-wide text-neutral-500 uppercase"
        >
          Prescriptions <span className="font-normal text-neutral-400 normal-case">(optional)</span>
        </h2>
        <Button size="sm" variant="outline" onClick={onAdd}>
          + Add Medication
        </Button>
      </div>

      {prescriptions.length === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400">
          No prescriptions added. Click &ldquo;Add Medication&rdquo; to start.
        </p>
      )}

      <div className="space-y-3">
        {prescriptions.map((rx) => (
          <div key={rx.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Medication</span>
              <button
                type="button"
                onClick={() => onRemove(rx.id)}
                aria-label="Remove prescription"
                className="text-xs text-neutral-400 hover:text-red-500"
              >
                Remove
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Drug name + Calculate Dose button */}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Drug Name *
                </label>
                <div className="flex gap-2">
                  <input
                    value={rx.drugName}
                    onChange={(e) => onUpdate(rx.id, 'drugName', e.target.value)}
                    placeholder="e.g. Amoxicillin"
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => onOpenDosageCalculator(rx.id)}
                    title="AI Dosage Calculator"
                    className="flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium whitespace-nowrap text-blue-700 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <span aria-hidden="true">✨</span> Calculate Dose
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Dosage</label>
                <input
                  value={rx.dosage}
                  onChange={(e) => onUpdate(rx.id, 'dosage', e.target.value)}
                  placeholder="e.g. 500 mg"
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Frequency</label>
                <input
                  value={rx.frequency}
                  onChange={(e) => onUpdate(rx.id, 'frequency', e.target.value)}
                  placeholder="e.g. every 8 hours"
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Route</label>
                <select
                  value={rx.route}
                  onChange={(e) => onUpdate(rx.id, 'route', e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="oral">Oral</option>
                  <option value="injection">Injection</option>
                  <option value="topical">Topical</option>
                  <option value="inhaled">Inhaled</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Duration</label>
                <input
                  value={rx.duration}
                  onChange={(e) => onUpdate(rx.id, 'duration', e.target.value)}
                  placeholder="e.g. 7 days"
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
