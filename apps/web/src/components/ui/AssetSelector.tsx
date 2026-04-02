"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";

export interface Asset {
  code: string;
  label: string;
}

const DEFAULT_ASSETS: Asset[] = [
  { code: "XLM", label: "XLM — Stellar Lumens" },
  { code: "USDC", label: "USDC — USD Coin" },
];

export interface AssetSelectorProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children"
> {
  label?: string;
  assets?: Asset[];
  error?: string;
}

export const AssetSelector = forwardRef<HTMLSelectElement, AssetSelectorProps>(
  ({ label, assets = DEFAULT_ASSETS, error, className, id, ...props }, ref) => {
    const selectId = id ?? "asset-selector";
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-neutral-700"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={Boolean(error)}
          className={[
            "w-full rounded-md border bg-white px-3 py-2 text-sm text-neutral-900",
            "transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error ? "border-danger-500" : "border-neutral-200",
            className ?? "",
          ].join(" ")}
          {...props}
        >
          {assets.map((a) => (
            <option key={a.code} value={a.code}>
              {a.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-danger-500">{error}</p>}
      </div>
    );
  },
);

AssetSelector.displayName = "AssetSelector";
