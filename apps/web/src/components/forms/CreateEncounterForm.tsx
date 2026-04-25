'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Input, Button } from '@/components/ui';
import { SoapNotesEditor } from '@/components/encounters/SoapNotesEditor';

const schema = z.object({
  patientId:      z.string().min(1, 'Required'),
  chiefComplaint: z.string().min(1, 'Required'),
  notes:          z.string().optional(),
});

export type CreateEncounterData = z.infer<typeof schema> & {
  soapNotes?: { subjective?: string; objective?: string; assessment?: string; plan?: string };
};

interface Props {
  onSubmit: (data: CreateEncounterData) => Promise<void>;
  onCancel: () => void;
  defaultPatientId?: string;
}

export function CreateEncounterForm({ onSubmit, onCancel, defaultPatientId }: Props) {
  const [soapNotes, setSoapNotes] = useState<CreateEncounterData['soapNotes']>({});

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { patientId: defaultPatientId ?? '' },
  });

  const submit = async (data: z.infer<typeof schema>) => {
    try {
      await onSubmit({ ...data, soapNotes });
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
      <Input label="Chief Complaint" {...register('chiefComplaint')} error={errors.chiefComplaint?.message} />

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
