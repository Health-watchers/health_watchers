'use client';

import { forwardRef, type SelectHTMLAttributes } from 'react';

export interface Asset {
  code: string;
  label: string;
}

const DEFAULT_ASSETS: Asset[] = [
  { code: 'XLM', label: 'XLM — Stellar Lumens' },
  { code: 'USDC', label: 'USDC — USD Coin' },
];

export interface AssetSelectorProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'children'
> {
  label?: string;
  assets?: Asset[];
  error?: string;
}

export const AssetSelector = forwardRef<HTMLSelectElement, AssetSelectorProps>(
  (
    {
      label,
      assets = DEFAULT_ASSETS,
      error,
      className,
      id,
      required,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref
  ) => {
    const selectId = id ?? 'asset-selector';
    const errorId = `${selectId}-error`;
    const describedBy = [ariaDescribedBy, error ? errorId : undefined].filter(Boolean).join(' ');

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-neutral-700">
            {label}
            {required && (
              <>
                <span aria-hidden="true" className="text-danger-600 ml-1">
                  *
                </span>
                <span className="sr-only"> required</span>
              </>
            )}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          required={required}
          aria-required={required || undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy || undefined}
          className={[
            'w-full rounded-md border bg-white px-3 py-2 text-sm text-neutral-900',
            'focus:ring-primary-500 focus:border-primary-500 transition-colors focus:ring-2 focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-danger-500' : 'border-neutral-200',
            className ?? '',
          ].join(' ')}
          {...props}
        >
          {assets.map((a) => (
            <option key={a.code} value={a.code}>
              {a.label}
            </option>
          ))}
        </select>
        {error && (
          <p id={errorId} role="alert" className="text-danger-500 text-xs">
            {error}
          </p>
        )}
      </div>
    );
  }
);

AssetSelector.displayName = 'AssetSelector';
