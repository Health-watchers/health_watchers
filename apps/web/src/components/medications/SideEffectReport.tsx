'use client';

import { useState } from 'react';
import { Badge, Button, EmptyState, Select, Textarea } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { SIDE_EFFECT_SEVERITY_LABELS, sideEffectBadgeVariant } from '@/lib/medications/labels';
import type {
  Medication,
  SideEffectReport as SideEffectReportEntry,
  SideEffectSeverity,
} from '@/lib/medications/types';

export interface NewSideEffectReport {
  medicationId: string;
  medicationName: string;
  severity: SideEffectSeverity;
  symptoms: string[];
  description: string;
  actionTaken: string;
}

export interface SideEffectReportProps {
  medications: readonly Medication[];
  reports: readonly SideEffectReportEntry[];
  isSubmitting: boolean;
  onSubmit: (report: NewSideEffectReport) => void;
}

const SYMPTOMS = [
  'Nausea',
  'Dizziness',
  'Rash',
  'Headache',
  'Diarrhoea',
  'Fatigue',
  'Muscle pain',
  'Bleeding or bruising',
  'Dry cough',
  'Palpitations',
  'Blurred vision',
  'Swelling',
];

const SEVERITY_OPTIONS: { value: SideEffectSeverity; label: string }[] = [
  { value: 'mild', label: SIDE_EFFECT_SEVERITY_LABELS.mild },
  { value: 'moderate', label: SIDE_EFFECT_SEVERITY_LABELS.moderate },
  { value: 'severe', label: SIDE_EFFECT_SEVERITY_LABELS.severe },
];

/** Issue #1314 — side effect reporting. */
export function SideEffectReportForm({
  medications,
  reports,
  isSubmitting,
  onSubmit,
}: SideEffectReportProps) {
  const eligible = medications.filter((medication) => medication.status !== 'completed');
  const medicationOptions = eligible.map((medication) => ({
    value: medication.id,
    label: `${medication.drugName} ${medication.dosage}`,
  }));

  const [medicationId, setMedicationId] = useState('');
  const [severity, setSeverity] = useState<SideEffectSeverity>('mild');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggleSymptom = (symptom: string) => {
    setSymptoms((current) =>
      current.includes(symptom) ? current.filter((item) => item !== symptom) : [...current, symptom]
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const medication = eligible.find((item) => item.id === medicationId);
    if (!medication) {
      setError('Select the medication that caused the side effect.');
      return;
    }
    if (symptoms.length === 0 && !description.trim()) {
      setError('Select at least one symptom or describe what happened.');
      return;
    }

    setError(null);
    onSubmit({
      medicationId: medication.id,
      medicationName: medication.drugName,
      severity,
      symptoms,
      description: description.trim(),
      actionTaken: actionTaken.trim(),
    });
    setMedicationId('');
    setSeverity('mild');
    setSymptoms([]);
    setDescription('');
    setActionTaken('');
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4" aria-label="Report a side effect">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Medication *"
            placeholder="Select a medication"
            options={medicationOptions}
            value={medicationId}
            onChange={(event) => setMedicationId(event.target.value)}
          />
          <Select
            label="Severity *"
            options={SEVERITY_OPTIONS}
            value={severity}
            onChange={(event) => setSeverity(event.target.value as SideEffectSeverity)}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Symptoms
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SYMPTOMS.map((symptom) => (
              <label
                key={symptom}
                className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-neutral-300"
                  checked={symptoms.includes(symptom)}
                  onChange={() => toggleSymptom(symptom)}
                />
                {symptom}
              </label>
            ))}
          </div>
        </fieldset>

        <Textarea
          label="Description"
          rows={3}
          placeholder="Describe onset, duration and anything that makes it better or worse."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Textarea
          label="Action taken"
          rows={2}
          placeholder="e.g. Dose reduced, medication stopped, referred for review."
          value={actionTaken}
          onChange={(event) => setActionTaken(event.target.value)}
        />

        {error && (
          <p role="alert" className="text-danger-600 dark:text-danger-400 text-sm">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" loading={isSubmitting} disabled={eligible.length === 0}>
            Submit report
          </Button>
        </div>
      </form>

      {reports.length === 0 ? (
        <EmptyState
          title="No side effects reported"
          description="Adverse effect reports from clinicians and patients appear here."
        />
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => (
            <li
              key={report.id}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={sideEffectBadgeVariant(report.severity)}>
                  {SIDE_EFFECT_SEVERITY_LABELS[report.severity]}
                </Badge>
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {report.medicationName}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {formatDateTime(report.reportedAt)} · {report.reportedBy}
                </span>
              </div>
              {report.symptoms.length > 0 && (
                <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                  Symptoms: {report.symptoms.join(', ')}
                </p>
              )}
              {report.description && (
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  {report.description}
                </p>
              )}
              {report.actionTaken && (
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Action: {report.actionTaken}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
