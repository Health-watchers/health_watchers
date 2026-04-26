'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Input, Button } from '@/components/ui';
import { SoapNotesEditor } from '@/components/encounters/SoapNotesEditor';
import DifferentialDiagnosisPanel, {
  type DifferentialItem,
} from '@/components/encounters/DifferentialDiagnosisPanel';

const schema = z.object({
  patientId:      z.string().min(1, 'Required'),
  chiefComplaint: z.string().min(1, 'Required'),
  notes:          z.string().optional(),
});

export type DiagnosisEntry = {
  code: string;
  description: string;
  isPrimary?: boolean;
};

export type CreateEncounterData = z.infer<typeof schema> & {
  soapNotes?: { subjective?: string; objective?: string; assessment?: string; plan?: string };
  diagnosis?: DiagnosisEntry[];
};

interface Props {
  onSubmit: (data: CreateEncounterData) => Promise<void>;
  onCancel: () => void;
  defaultPatientId?: string;
}

export function CreateEncounterForm({ onSubmit, onCancel, defaultPatientId }: Props) {
  const [soapNotes, setSoapNotes] = useState<CreateEncounterData['soapNotes']>({});
  const [diagnoses, setDiagnoses] = useState<DiagnosisEntry[]>([]);
  const [showAiPanel, setShowAiPanel] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { patientId: defaultPatientId ?? '' },
  });

  const chiefComplaint = watch('chiefComplaint') ?? '';

  const handleAddDiagnosis = (item: DifferentialItem) => {
    setDiagnoses((prev) => {
      // Avoid duplicates
      if (prev.some((d) => d.code === item.icdCode)) return prev;
      return [
        ...prev,
        {
          code: item.icdCode,
          description: item.diagnosis,
          isPrimary: prev.length === 0,
        },
      ];
    });
  };

  const removeDiagnosis = (code: string) => {
    setDiagnoses((prev) => prev.filter((d) => d.code !== code));
  };

  const submit = async (data: z.infer<typeof schema>) => {
    try {
      await onSubmit({ ...data, soapNotes, diagnosis: diagnoses.length > 0 ? diagnoses : undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create encounter';
      setError('root', { message: msg });
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      {errors.root && (
        <p role="alert" className="text-sm text-red-600">{errors.root.message}</p>
      )}

      <Input label="Patient ID" {...register('patientId')} error={errors.patientId?.message} />

      {/* Chief Complaint + AI trigger */}
      <div className="space-y-2">
        <Input
          label="Chief Complaint"
          {...register('chiefComplaint')}
          error={errors.chiefComplaint?.message}
        />
        <button
          type="button"
          onClick={() => setShowAiPanel((v) => !v)}
          disabled={!chiefComplaint.trim()}
          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          aria-expanded={showAiPanel}
          aria-controls="ai-differential-panel"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {showAiPanel ? 'Hide AI Suggestions' : 'Get AI Differential Diagnosis'}
        </button>
      </div>

      {/* AI Differential Diagnosis Panel */}
      {showAiPanel && (
        <div id="ai-differential-panel">
          <DifferentialDiagnosisPanel
            chiefComplaint={chiefComplaint}
            onAddDiagnosis={handleAddDiagnosis}
          />
        </div>
      )}

      {/* Added diagnoses */}
      {diagnoses.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">
            Diagnoses ({diagnoses.length})
          </p>
          <ul className="space-y-1.5">
            {diagnoses.map((d) => (
              <li
                key={d.code}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-mono text-xs text-gray-500 mr-2">{d.code}</span>
                  <span className="text-gray-800">{d.description}</span>
                  {d.isPrimary && (
                    <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                      Primary
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => removeDiagnosis(d.code)}
                  className="ml-2 text-gray-400 hover:text-red-500"
                  aria-label={`Remove diagnosis ${d.description}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-secondary-700 mb-2">SOAP Notes</label>
        <SoapNotesEditor value={soapNotes ?? {}} onChange={setSoapNotes} />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? 'Saving…' : 'Save Encounter'}
        </Button>
      </div>
    </form>
  );
}
