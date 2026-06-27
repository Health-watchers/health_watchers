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
import { FeeEstimateDisplay } from '@/components/payments/FeeEstimateDisplay';

type FeeStrategy = 'slow' | 'standard' | 'fast';

/** A single payment path returned by GET /payments/paths. */
export interface PaymentPath {
  sourceAssetCode: string;
  sourceAssetIssuer?: string;
  sourceAmount: string;
  destinationAssetCode: string;
  destinationAssetIssuer?: string;
  destinationAmount: string;
  /** Intermediate hop asset codes, e.g. ['yXLM', 'EURT']. */
  path: string[];
}

const schema = z.object({
  patientId: z.string().min(1, 'Patient is required'),
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Enter a valid amount (e.g. 10.50)'),
  asset: z.string().min(1, 'Asset is required'),
  payWithAsset: z.string().min(1, 'Source asset is required'),
  memo: z.string().max(28, 'Memo must be 28 chars or fewer').optional(),
  slippage: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter valid percentage')
    .optional()
    .default('1'),
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
  const [paths, setPaths] = useState<PaymentPath[]>([]);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | null>(null);
  const [loadingPath, setLoadingPath] = useState(false);
  const [feeStrategy, setFeeStrategy] = useState<FeeStrategy>('standard');
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
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

  const isPathPayment = payWithAsset !== destinationAsset;
  const selectedPath = selectedPathIndex !== null ? (paths[selectedPathIndex] ?? null) : null;
  const exchangeRate =
    selectedPath && amount ? parseFloat(selectedPath.sourceAmount) / parseFloat(amount) : null;

  const fetchPaths = useCallback(async () => {
    // Only path payments (source != destination) need path discovery.
    if (!amount || !payWithAsset || !destinationAsset || payWithAsset === destinationAsset) {
      setPaths([]);
      setSelectedPathIndex(null);
      return;
    }

    setLoadingPath(true);
    try {
      const query = new URLSearchParams({
        sourceAsset: payWithAsset,
        destinationAsset,
        amount,
      });
      const res = await fetch(`${API_V1}/payments/paths?${query}`);
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data) && data.data.length > 0) {
        setPaths(data.data as PaymentPath[]);
        setSelectedPathIndex(0); // default to the best (first) path
      } else {
        setPaths([]);
        setSelectedPathIndex(null);
      }
    } catch (err) {
      console.error('Failed to fetch payment paths:', err);
      setPaths([]);
      setSelectedPathIndex(null);
    } finally {
      setLoadingPath(false);
    }
  }, [amount, payWithAsset, destinationAsset]);

  // Refresh paths on input change and every 30s (rates move).
  useEffect(() => {
    fetchPaths();
    const interval = setInterval(fetchPaths, 30000);
    return () => clearInterval(interval);
  }, [fetchPaths]);

  const submit = async (formData: z.infer<typeof schema>) => {
    const data = { ...formData } as PaymentIntentData;
    try {
      const payload: PaymentIntentData = { ...data, feeStrategy };

      if (isPathPayment && selectedPath) {
        // Apply slippage tolerance to the source amount the patient is willing to spend.
        const slipFactor = 1 + parseFloat(slippage) / 100;
        const maxSourceAmount = (parseFloat(selectedPath.sourceAmount) * slipFactor).toFixed(7);

        payload.sourceAssetCode = selectedPath.sourceAssetCode;
        payload.sourceAssetIssuer = selectedPath.sourceAssetIssuer;
        payload.destinationAmount = amount;
        payload.maxSourceAmount = maxSourceAmount;
        payload.path = selectedPath.path;
      }

      await onSubmit(payload);
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : 'Failed to create payment intent.',
      });
    }
  };

  const handleCreateClick = () => {
    // Path payments get an explicit confirmation step; same-asset payments submit directly.
    if (isPathPayment && selectedPath) {
      setShowConfirm(true);
    } else {
      handleSubmit(submit)();
    }
  };

  return (
    <>
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
          <AssetSelector
            id="receive-asset"
            label="Receive Asset"
            {...register('asset')}
            error={errors.asset?.message}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <AssetSelector
            id="pay-with-asset"
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

        {isPathPayment && amount && (
          <div className="rounded-md bg-primary-50 p-3 text-sm">
            {loadingPath ? (
              <p className="animate-pulse text-primary-700">Calculating best paths...</p>
            ) : paths.length > 0 ? (
              <fieldset className="space-y-2">
                <legend className="text-primary-600 font-medium">Available Paths</legend>
                <div className="space-y-2">
                  {paths.map((p, idx) => {
                    const rate = parseFloat(p.sourceAmount) / parseFloat(amount);
                    const hops = p.path.length;
                    return (
                      <label
                        key={idx}
                        className={`flex items-center justify-between rounded-md border p-2 cursor-pointer ${
                          selectedPathIndex === idx
                            ? 'border-primary-400 bg-white'
                            : 'border-transparent'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-semibold">
                            {p.sourceAmount} {payWithAsset}
                          </div>
                          <div className="text-xs text-primary-500">
                            1 {destinationAsset} ≈ {rate.toFixed(4)} {payWithAsset}
                          </div>
                          <div className="text-xs text-primary-400">
                            {hops === 0
                              ? 'Direct conversion'
                              : `via ${p.path.join(' → ')} (${hops} hop${hops > 1 ? 's' : ''})`}
                          </div>
                        </div>
                        <input
                          type="radio"
                          name="selectedPath"
                          value={idx}
                          checked={selectedPathIndex === idx}
                          onChange={() => setSelectedPathIndex(idx)}
                          className="ml-3"
                        />
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-primary-400">
                  Rates refresh automatically. Network fees are paid separately in XLM.
                </p>
              </fieldset>
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

        {/* Network fees are always paid in XLM, for both direct and path payments. */}
        <FeeEstimateDisplay selected={feeStrategy} onChange={setFeeStrategy} amount={amount} />

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
            {selectedPath && (
              <>
                <div className="flex justify-between text-neutral-600">
                  <span>Patient Pays (Estimated)</span>
                  <span className="font-semibold text-neutral-900">
                    {selectedPath.sourceAmount} {payWithAsset}
                  </span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>Exchange Rate</span>
                  <span>
                    1 {destinationAsset} ≈ {exchangeRate?.toFixed(4)} {payWithAsset}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between text-neutral-600">
              <span>Fee speed</span>
              <span className="capitalize">{feeStrategy}</span>
            </div>
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
            disabled={isPathPayment && !selectedPath && !loadingPath}
          >
            {isSubmitting ? 'Submitting…' : 'Create Payment Intent'}
          </Button>
        </div>
      </form>

      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Confirm Path Payment">
        <div className="space-y-3">
          <p className="text-sm">
            You are creating a path payment. Review the estimated source amount and exchange rate
            before proceeding.
          </p>
          {selectedPath && (
            <div className="rounded-md border p-3">
              <div className="flex justify-between">
                <span className="text-sm">Estimated Patient Pays</span>
                <span className="font-bold">
                  {selectedPath.sourceAmount} {payWithAsset}
                </span>
              </div>
              <div className="mt-1 flex justify-between text-xs text-neutral-500">
                <span>Exchange Rate</span>
                <span>
                  1 {destinationAsset} ≈ {exchangeRate?.toFixed(4)} {payWithAsset}
                </span>
              </div>
              <div className="mt-1 flex justify-between text-xs text-neutral-500">
                <span>Slippage Tolerance</span>
                <span>{slippage}%</span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowConfirm(false)}>
              Back
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              loading={isSubmitting}
              onClick={async () => {
                setShowConfirm(false);
                await handleSubmit(submit)();
              }}
            >
              Confirm &amp; Create
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
