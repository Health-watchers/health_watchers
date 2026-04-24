'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input, Button } from '@/components/ui';

const schema = z.object({
  patientId: z.string().min(1, 'Required'),
  chiefComplaint: z.string().min(1, 'Required'),
  notes: z.string().min(1, 'Required'),
});

export type CreateEncounterData = z.infer<typeof schema>;

interface Props {
  onSubmit: (data: CreateEncounterData) => Promise<void>;
  onCancel: () => void;
  defaultPatientId?: string;
}

export function CreateEncounterForm({ onSubmit, onCancel, defaultPatientId }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CreateEncounterData>({
    resolver: zodResolver(schema),
    defaultValues: { patientId: defaultPatientId ?? '' },
  });

  const submit = async (data: CreateEncounterData) => {
    try {
      await onSubmit(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create encounter';
      setError('root', { message: msg });
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      {errors.root && (
        <p role="alert" className="text-sm text-red-600">
          {errors.root.message}
        </p>
      )}

      <Input label="Patient ID" {...register('patientId')} error={errors.patientId?.message} />
      <Input
        label="Chief Complaint"
        {...register('chiefComplaint')}
        error={errors.chiefComplaint?.message}
      />
      <Input label="Notes" {...register('notes')} error={errors.notes?.message} />

      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? 'Saving...' : 'Save Encounter'}
        </Button>
      </div>
    </form>
  );
}
