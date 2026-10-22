'use client';

import { useMemo, useState } from 'react';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { MedicationSearch } from './MedicationSearch';
import { InteractionWarnings } from './InteractionWarnings';
import { checkInteractions, requiresOverride } from '@/lib/medications/interactions';
import { FREQUENCY_OPTIONS, ROUTE_OPTIONS, SOURCE_LABELS } from '@/lib/medications/labels';
import { todayIso } from '@/lib/medications/format';
import type {
  Drug,
  Medication,
  MedicationFrequency,
  MedicationRoute,
  MedicationSource,
  NewMedicationInput,
} from '@/lib/medications/types';

export interface MedicationFormProps {
  /** Current regimen — used for the live interaction check. */
  activeMedications: readonly Medication[];
  defaultPrescriber: string;
  isSubmitting: boolean;
  onSubmit: (input: NewMedicationInput) => void;
  onCancel: () => void;
}

const SOURCE_OPTIONS: { value: MedicationSource; label: string }[] = [
  { value: 'clinic', label: SOURCE_LABELS.clinic },
  { value: 'patient_reported', label: SOURCE_LABELS.patient_reported },
  { value: 'pharmacy', label: SOURCE_LABELS.pharmacy },
];

/**
 * Issue #1314 — add-medication form with dosage/frequency entry.
 * The interaction check fires as soon as a formulary drug is selected, so
 * warnings appear immediately rather than on submit.
 */
export function MedicationForm({
  activeMedications,
  defaultPrescriber,
  isSubmitting,
  onSubmit,
  onCancel,
}: MedicationFormProps) {
  const [query, setQuery] = useState('');
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState<MedicationFrequency>('once_daily');
  const [route, setRoute] = useState<MedicationRoute>('oral');
  const [startDate, setStartDate] = useState(todayIso());
  const [indication, setIndication] = useState('');
  const [instructions, setInstructions] = useState('');
  const [quantity, setQuantity] = useState('30');
  const [refills, setRefills] = useState('0');
  const [prescriber, setPrescriber] = useState(defaultPrescriber);
  const [source, setSource] = useState<MedicationSource>('clinic');
  const [formError, setFormError] = useState<string | null>(null);
  const [overrideAcknowledged, setOverrideAcknowledged] = useState(false);

  // Recomputed on every drug selection → warnings appear immediately.
  const interactions = useMemo(() => {
    if (!selectedDrug) return [];
    return checkInteractions(
      { drugId: selectedDrug.id, drugName: selectedDrug.name },
      activeMedications
    );
  }, [selectedDrug, activeMedications]);

  const needsOverride = requiresOverride(interactions);
  const dosageOptionsId = selectedDrug ? `dosage-options-${selectedDrug.id}` : 'dosage-options';

  const reset = () => {
    setQuery('');
    setSelectedDrug(null);
    setDosage('');
    setFrequency('once_daily');
    setRoute('oral');
    setStartDate(todayIso());
    setIndication('');
    setInstructions('');
    setQuantity('30');
    setRefills('0');
    setPrescriber(defaultPrescriber);
    setSource('clinic');
    setOverrideAcknowledged(false);
    setFormError(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedDrug) {
      setFormError('Search for and select a formulary medication first.');
      return;
    }
    if (!dosage.trim()) {
      setFormError('Enter a dose, for example 500 mg.');
      return;
    }
    if (needsOverride && !overrideAcknowledged) {
      setFormError('Acknowledge the interaction warning before continuing.');
      return;
    }

    setFormError(null);
    onSubmit({
      drugId: selectedDrug.id,
      drugName: selectedDrug.name,
      genericName: selectedDrug.genericName,
      drugClass: selectedDrug.drugClass,
      route,
      dosage: dosage.trim(),
      frequency,
      startDate,
      indication: indication.trim(),
      instructions: instructions.trim(),
      quantity: Number.parseInt(quantity, 10) || 0,
      refillsRemaining: Number.parseInt(refills, 10) || 0,
      prescriber: prescriber.trim() || defaultPrescriber,
      source,
    });
    reset();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-label="Add medication">
      <MedicationSearch
        label="Medication *"
        query={query}
        onQueryChange={setQuery}
        onSelect={(drug) => {
          setSelectedDrug(drug);
          setRoute(drug.defaultRoute);
          const firstDose = drug.commonDosages[0];
          if (firstDose) setDosage(firstDose);
        }}
        selectedDrug={selectedDrug}
      />

      <InteractionWarnings checks={interactions} showAllClear={Boolean(selectedDrug)} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Input
            label="Dose *"
            placeholder="e.g. 500 mg"
            value={dosage}
            onChange={(event) => setDosage(event.target.value)}
            list={dosageOptionsId}
            required
          />
          <datalist id={dosageOptionsId}>
            {(selectedDrug?.commonDosages ?? []).map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
        <Select
          label="Frequency *"
          options={FREQUENCY_OPTIONS}
          value={frequency}
          onChange={(event) => setFrequency(event.target.value as MedicationFrequency)}
        />
        <Select
          label="Route *"
          options={ROUTE_OPTIONS}
          value={route}
          onChange={(event) => setRoute(event.target.value as MedicationRoute)}
        />
        <Input
          label="Start date *"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          required
        />
        <Input
          label="Prescriber"
          value={prescriber}
          onChange={(event) => setPrescriber(event.target.value)}
        />
        <Select
          label="Source"
          options={SOURCE_OPTIONS}
          value={source}
          onChange={(event) => setSource(event.target.value as MedicationSource)}
        />
        <Input
          label="Quantity dispensed"
          type="number"
          min={0}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <Input
          label="Refills authorised"
          type="number"
          min={0}
          value={refills}
          onChange={(event) => setRefills(event.target.value)}
        />
        <Input
          label="Indication"
          placeholder="e.g. Hypertension"
          value={indication}
          onChange={(event) => setIndication(event.target.value)}
        />
      </div>

      <Textarea
        label="Instructions to patient"
        rows={3}
        placeholder="e.g. Take with food. Report muscle pain."
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
      />

      {needsOverride && (
        <label className="border-danger-200 bg-danger-50 flex items-start gap-2 rounded-lg border p-3 text-sm text-neutral-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-neutral-300"
            checked={overrideAcknowledged}
            onChange={(event) => setOverrideAcknowledged(event.target.checked)}
          />
          <span>
            I have reviewed the interaction warning and am prescribing this combination
            deliberately.
          </span>
        </label>
      )}

      {formError && (
        <p role="alert" className="text-danger-600 dark:text-danger-400 text-sm">
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Add medication
        </Button>
      </div>
    </form>
  );
}
