'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input, Button } from '@/components/ui';

const schema = z.object({
  patientId: z.string().min(1, 'Required'),
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Enter a valid amount'),
});

export type CreatePaymentData = z.infer<typeof schema>;

interface Props {
  onSubmit: (data: CreatePaymentData) => Promise<void>;
  onCancel: () => void;
  defaultPatientId?: string;
}

export function CreatePaymentIntentForm({ onSubmit, onCancel, defaultPatientId }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CreatePaymentData>({
    resolver: zodResolver(schema),
    defaultValues: { patientId: defaultPatientId ?? '' },
  });

  const submit = async (data: CreatePaymentData) => {
    try {
      await onSubmit(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create payment';
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
        label="Amount (XLM)"
        type="text"
        inputMode="decimal"
        placeholder="0.00"
        {...register('amount')}
        error={errors.amount?.message}
      />

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
          {isSubmitting ? 'Submitting...' : 'Create Payment'}
        </Button>
      </div>
    </form>
  );
}
