'use client';

import { useFeeEstimate, type FeeTier } from '@/hooks/useFeeEstimate';

type FeeStrategy = 'slow' | 'standard' | 'fast';

const TIERS: { value: FeeStrategy; label: string }[] = [
  { value: 'slow',     label: 'Slow' },
  { value: 'standard', label: 'Standard' },
  { value: 'fast',     label: 'Fast' },
];

interface Props {
  selected: FeeStrategy;
  onChange: (strategy: FeeStrategy) => void;
  amount?: string;
}

export function FeeEstimateDisplay({ selected, onChange, amount }: Props) {
  const { data, isLoading, isError, refetch, isFetching } = useFeeEstimate();

  const selectedTier: FeeTier | undefined = data?.[selected];

  const totalXlm =
    amount && selectedTier
      ? (parseFloat(amount) + parseFloat(selectedTier.xlm)).toFixed(7)
      : null;

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-neutral-700">Network Fee</span>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-primary-600 hover:underline disabled:opacity-50"
          aria-label="Refresh fee estimate"
        >
          {isFetching ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {isError && (
        <p className="text-xs text-danger-500">Fee estimate unavailable. Using network defaults.</p>
      )}

      {/* Speed selector */}
      <div className="flex gap-2" role="group" aria-label="Fee speed">
        {TIERS.map(({ value, label }) => {
          const tier = data?.[value];
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(value)}
              className={`flex-1 rounded border px-2 py-1.5 text-center transition-colors ${
                selected === value
                  ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
              }`}
              aria-pressed={selected === value}
            >
              <div>{label}</div>
              {isLoading ? (
                <div className="mt-0.5 h-3 w-12 mx-auto animate-pulse rounded bg-neutral-200" />
              ) : tier ? (
                <div className="mt-0.5 text-xs opacity-75">{tier.xlm} XLM</div>
              ) : null}
              {tier && (
                <div className="text-xs opacity-60">{tier.confirmationTime}</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Fee + total breakdown */}
      {selectedTier && (
        <div className="space-y-1 text-neutral-600 border-t border-neutral-200 pt-2">
          <div className="flex justify-between">
            <span>Fee ({selected})</span>
            <span className="font-mono">
              {selectedTier.xlm} XLM
              <span className="text-neutral-400 ml-1">({selectedTier.stroops} stroops)</span>
            </span>
          </div>
          {totalXlm && (
            <div className="flex justify-between font-semibold text-neutral-900">
              <span>Total</span>
              <span className="font-mono">{totalXlm} XLM</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
