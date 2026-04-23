'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { AssetSelector } from '@/components/ui/AssetSelector';

const schema = z.object({
  patientId: z.string().min(1, 'Patient is required'),
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Enter a valid amount (e.g. 10.50)'),
  asset: z.string().min(1, 'Asset is required'),
  memo: z.string().max(28, 'Memo must be 28 chars or fewer').optional(),
});

export type PaymentIntentData = z.infer<typeof schema>;

interface Props {
  onSubmit: (data: PaymentIntentData) => Promise<void>;
  onCancel: () => void;
}

export function PaymentIntentForm({ onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<PaymentIntentData>({
    resolver: zodResolver(schema),
    defaultValues: { asset: 'XLM' },
  });

  const amount = watch('amount');
  const asset = watch('asset');
  const patientId = watch('patientId');

  const submit = async (data: PaymentIntentData) => {
    try {
      await onSubmit(data);
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : 'Failed to create payment intent.',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      {errors.root && (
        <p role="alert" className="bg-danger-50 text-danger-500 rounded-md px-3 py-2 text-sm">
          {errors.root.message}
        </p>
      )}

      <Input
        label="Patient ID"
        placeholder="Search or enter patient ID"
        {...register('patientId')}
        error={errors.patientId?.message}
      />

      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            label="Amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            {...register('amount')}
            error={errors.amount?.message}
          />
        </div>
        <div className="w-40">
          <AssetSelector label="Asset" {...register('asset')} error={errors.asset?.message} />
        </div>
      </div>

      <Input
        label="Memo (optional)"
        placeholder="Up to 28 characters"
        {...register('memo')}
        error={errors.memo?.message}
        helperText="Visible on the Stellar network"
      />

      {/* Summary box — shown once amount + patient are filled */}
      {amount && patientId && (
        <div className="space-y-1 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
          <p className="font-medium text-neutral-700">Summary</p>
          <div className="flex justify-between text-neutral-600">
            <span>Patient</span>
            <span className="font-mono">{patientId}</span>
          </div>
          <div className="flex justify-between text-neutral-600">
            <span>Amount</span>
            <span className="font-semibold text-neutral-900">
              {amount} {asset}
            </span>
          </div>
          <p className="pt-1 text-xs text-neutral-400">
            Review carefully — Stellar transactions cannot be reversed.
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" className="flex-1" loading={isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Create Payment Intent'}
        </Button>
      </div>
    </form>
  );
}
