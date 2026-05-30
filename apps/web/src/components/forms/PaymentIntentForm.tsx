'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { AssetSelector } from '@/components/ui/AssetSelector';
import { useState, useEffect, useCallback } from 'react';
import { API_V1 } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { FeeEstimateDisplay } from "@/components/payments/FeeEstimateDisplay";

type FeeStrategy = 'slow' | 'standard' | 'fast';

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
  feeStrategy: FeeStrategy;
};

interface Props {
  onSubmit: (data: PaymentIntentData) => Promise<void>;
  onCancel: () => void;
}

export function PaymentIntentForm({ onSubmit, onCancel }: Props) {
  const [pathEstimate, setPathEstimate] = useState<any>(null);
  const [paths, setPaths] = useState<any[]>([]);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | null>(null);
  const [loadingPath, setLoadingPath] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [feeStrategy, setFeeStrategy] = useState<FeeStrategy>('standard');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<z.infer<typeof schema>>({
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
        const allPaths = data.data;
        setPaths(allPaths);
        // default to first path
        setSelectedPathIndex(0);
        const bestPath = allPaths[0];
        setPathEstimate(bestPath);
        const rate = parseFloat(bestPath.sourceAmount) / parseFloat(amount);
        setExchangeRate(rate);
      } else {
        setPaths([]);
        setSelectedPathIndex(null);
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

  const submit = async (data: z.infer<typeof schema>) => {
    try {
      if (pathEstimate && selectedPathIndex !== null) {
        const chosen = paths[selectedPathIndex] ?? pathEstimate;
        // Apply slippage to source amount
        const slipFactor = 1 + parseFloat(slippage) / 100;
        const maxSourceAmount = (parseFloat(chosen.sourceAmount) * slipFactor).toFixed(7);
        
        data.sourceAssetCode = chosen.sourceAssetCode;
        data.sourceAssetIssuer = chosen.sourceAssetIssuer;
        data.destinationAmount = amount;
        data.maxSourceAmount = maxSourceAmount;
        data.path = chosen.path;
      }
      }
      await onSubmit({ ...data, feeStrategy });
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : 'Failed to create payment intent.',
      });
    }
  };

  const [showConfirm, setShowConfirm] = useState(false);

  const handleCreateClick = () => {
    // If this is a path payment, show confirmation modal; otherwise submit immediately
    if (payWithAsset !== destinationAsset && pathEstimate) {
      setShowConfirm(true);
    } else {
      // trigger normal submit
      handleSubmit(submit)();
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
            <p className="animate-pulse text-primary-700">Calculating best paths...</p>
          ) : paths.length > 0 ? (
            <div className="space-y-2">
              <div className="text-primary-600 font-medium">Available Paths</div>
              <div className="space-y-2">
                {paths.map((p, idx) => {
                  const rate = parseFloat(p.sourceAmount) / parseFloat(amount);
                  return (
                    <label
                      key={idx}
                      className={`flex items-center justify-between p-2 rounded-md cursor-pointer border ${selectedPathIndex === idx ? 'border-primary-400 bg-white' : 'border-transparent'}`}
                    >
                      <div>
                        <div className="text-sm font-semibold">{p.sourceAmount} {payWithAsset}</div>
                        <div className="text-xs text-primary-500">1 {destinationAsset} ≈ {rate.toFixed(4)} {payWithAsset}</div>
                      </div>
                      <input
                        type="radio"
                        name="selectedPath"
                        checked={selectedPathIndex === idx}
                        onChange={() => {
                          setSelectedPathIndex(idx);
                          setPathEstimate(p);
                          setExchangeRate(rate);
                        }}
                        className="ml-3"
                      />
                    </label>
                  );
                })}
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

      {/* Fee estimate — only shown for XLM payments */}
      {asset === 'XLM' && (
        <FeeEstimateDisplay
          selected={feeStrategy}
          onChange={setFeeStrategy}
          amount={amount}
        />
      )}

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
          {pathEstimate && (
            <div className="flex justify-between text-neutral-600">
              <span>Patient Pays (Estimated)</span>
              <span className="font-semibold text-neutral-900">
                {pathEstimate.sourceAmount} {payWithAsset}
              </span>
            </div>
          )}
          {asset === 'XLM' && (
            <div className="flex justify-between text-neutral-600">
              <span>Fee speed</span>
              <span className="capitalize">{feeStrategy}</span>
            </div>
          )}
          <p className="text-xs text-neutral-400 pt-1">
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
          type="button" 
          variant="primary" 
          className="flex-1" 
          loading={isSubmitting}
          onClick={handleCreateClick}
          disabled={payWithAsset !== destinationAsset && !pathEstimate && !loadingPath}
        >
          {isSubmitting ? 'Submitting…' : 'Create Payment Intent'}
        </Button>
      </div>
    </form>

    <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Confirm Path Payment">
      <div className="space-y-3">
        <p className="text-sm">You are creating a path payment. Review the estimated source amount and exchange rate before proceeding.</p>
        {pathEstimate && (
          <div className="rounded-md border p-3">
            <div className="flex justify-between">
              <span className="text-sm">Estimated Patient Pays</span>
              <span className="font-bold">{pathEstimate.sourceAmount} {payWithAsset}</span>
            </div>
            <div className="flex justify-between text-xs text-neutral-500 mt-1">
              <span>Exchange Rate</span>
              <span>1 {destinationAsset} ≈ {exchangeRate?.toFixed(4)} {payWithAsset}</span>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={() => setShowConfirm(false)}>Back</Button>
          <Button variant="primary" className="flex-1" onClick={async () => {
            setShowConfirm(false);
            await handleSubmit(submit)();
          }}>Confirm & Create</Button>
        </div>
      </div>
    </Modal>
  );
}
