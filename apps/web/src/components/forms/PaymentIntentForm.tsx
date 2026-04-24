'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { AssetSelector } from '@/components/ui/AssetSelector';
import { useState, useEffect, useCallback } from 'react';
import { API_V1 } from '@/lib/api';

const schema = z.object({
  patientId: z.string().min(1, 'Patient is required'),
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Enter a valid amount (e.g. 10.50)'),
  asset: z.string().min(1, 'Asset is required'),
  payWithAsset: z.string().min(1, 'Source asset is required'),
  memo: z.string().max(28, 'Memo must be 28 chars or fewer').optional(),
  slippage: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter valid percentage').optional().default('1'),
});

export type PaymentIntentData = z.infer<typeof schema> & {
  sourceAssetCode?: string;
  sourceAssetIssuer?: string;
  destinationAmount?: string;
  maxSourceAmount?: string;
  path?: string[];
};

interface Props {
  onSubmit: (data: PaymentIntentData) => Promise<void>;
  onCancel: () => void;
}

export function PaymentIntentForm({ onSubmit, onCancel }: Props) {
  const [pathEstimate, setPathEstimate] = useState<any>(null);
  const [loadingPath, setLoadingPath] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<PaymentIntentData>({
    resolver: zodResolver(schema),
    defaultValues: { asset: 'XLM', payWithAsset: 'XLM', slippage: '1' },
  });

  const amount = watch('amount');
  const destinationAsset = watch('asset');
  const payWithAsset = watch('payWithAsset');
  const patientId = watch('patientId');
  const slippage = watch('slippage') || '1';

  const fetchPath = useCallback(async () => {
    if (!amount || !payWithAsset || !destinationAsset) return;
    if (payWithAsset === destinationAsset) {
      setPathEstimate(null);
      setExchangeRate(null);
      return;
    }

    setLoadingPath(true);
    try {
      const query = new URLSearchParams({
        sourceAsset: payWithAsset,
        destinationAsset: destinationAsset,
        amount: amount,
      });
      const res = await fetch(`${API_V1}/payments/paths?${query}`);
      const data = await res.json();
      if (data.status === 'success' && data.data.length > 0) {
        const bestPath = data.data[0]; // Strict-receive returns best path first
        setPathEstimate(bestPath);
        const rate = parseFloat(bestPath.sourceAmount) / parseFloat(amount);
        setExchangeRate(rate);
      } else {
        setPathEstimate(null);
        setExchangeRate(null);
      }
    } catch (err) {
      console.error('Failed to fetch path:', err);
    } finally {
      setLoadingPath(false);
    }
  }, [amount, payWithAsset, destinationAsset]);

  // Initial fetch and refresh every 30s
  useEffect(() => {
    fetchPath();
    const interval = setInterval(fetchPath, 30000);
    return () => clearInterval(interval);
  }, [fetchPath]);

  const submit = async (data: PaymentIntentData) => {
    try {
      if (pathEstimate) {
        // Apply slippage to source amount
        const slipFactor = 1 + parseFloat(slippage) / 100;
        const maxSourceAmount = (parseFloat(pathEstimate.sourceAmount) * slipFactor).toFixed(7);
        
        data.sourceAssetCode = pathEstimate.sourceAssetCode;
        data.sourceAssetIssuer = pathEstimate.sourceAssetIssuer;
        data.destinationAmount = amount;
        data.maxSourceAmount = maxSourceAmount;
        data.path = pathEstimate.path;
      }
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

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Amount to Receive"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          {...register('amount')}
          error={errors.amount?.message}
        />
        <AssetSelector label="Receive Asset" {...register('asset')} error={errors.asset?.message} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <AssetSelector 
          label="Pay with Asset" 
          {...register('payWithAsset')} 
          error={errors.payWithAsset?.message} 
        />
        <Input
          label="Slippage Tolerance (%)"
          type="text"
          inputMode="decimal"
          placeholder="1.0"
          {...register('slippage')}
          error={errors.slippage?.message}
        />
      </div>

      {payWithAsset !== destinationAsset && amount && (
        <div className="rounded-md bg-primary-50 p-3 text-sm">
          {loadingPath ? (
            <p className="animate-pulse text-primary-700">Calculating best path...</p>
          ) : pathEstimate ? (
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-primary-600">Estimated Cost</span>
                <span className="font-bold text-primary-900">
                  {pathEstimate.sourceAmount} {payWithAsset}
                </span>
              </div>
              <div className="flex justify-between text-xs text-primary-500">
                <span>Exchange Rate</span>
                <span>1 {destinationAsset} ≈ {exchangeRate?.toFixed(4)} {payWithAsset}</span>
              </div>
            </div>
          ) : (
            <p className="text-danger-600">No liquidity found for this conversion.</p>
          )}
        </div>
      )}

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
            <span>Clinic Receives</span>
            <span className="font-semibold text-neutral-900">
              {amount} {destinationAsset}
            </span>
          </div>
          <p className="pt-1 text-xs text-neutral-500">
          {pathEstimate && (
            <div className="flex justify-between text-neutral-600">
              <span>Patient Pays (Estimated)</span>
              <span className="font-semibold text-neutral-900">
                {pathEstimate.sourceAmount} {payWithAsset}
              </span>
            </div>
          )}
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
        <Button 
          type="submit" 
          variant="primary" 
          className="flex-1" 
          loading={isSubmitting}
          disabled={payWithAsset !== destinationAsset && !pathEstimate && !loadingPath}
        >
          {isSubmitting ? 'Submitting…' : 'Create Payment Intent'}
        </Button>
      </div>
    </form>
  );
}
