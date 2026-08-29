'use client';

import { ChevronDown, Info } from 'lucide-react';
import { useState } from 'react';

export interface FeeBreakdownData {
  baseFee: number;
  processingFee: number;
  networkFee: number;
  conversionFee?: number;
  insuranceFee?: number;
  total: number;
  currency: string;
}

interface PaymentFeeBreakdownProps {
  fees: FeeBreakdownData;
  breakdown?: boolean;
  tooltip?: string;
}

export function PaymentFeeBreakdown({
  fees,
  breakdown = true,
  tooltip = 'Detailed breakdown of all fees associated with this payment',
}: PaymentFeeBreakdownProps) {
  const [expanded, setExpanded] = useState(false);

  const feeItems = [
    { label: 'Base Fee', amount: fees.baseFee, info: 'Standard payment processing fee' },
    { label: 'Processing Fee', amount: fees.processingFee, info: 'Service provider fee' },
    { label: 'Network Fee', amount: fees.networkFee, info: 'Blockchain network transaction fee' },
    ...(fees.conversionFee
      ? [{ label: 'Conversion Fee', amount: fees.conversionFee, info: 'Currency conversion fee' }]
      : []),
    ...(fees.insuranceFee
      ? [{ label: 'Insurance Fee', amount: fees.insuranceFee, info: 'Insurance premium fee' }]
      : []),
  ];

  if (!breakdown) {
    return (
      <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Fees</span>
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {fees.currency} {fees.total.toFixed(2)}
          </span>
        </div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Included in your payment
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 dark:text-gray-100">Fee Breakdown</span>
          {tooltip && (
            <div className="group relative">
              <Info className="h-4 w-4 text-gray-400" />
              <div className="pointer-events-none absolute -left-2 top-full mt-2 hidden w-48 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 dark:bg-gray-700">
                {tooltip}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {fees.currency} {fees.total.toFixed(2)}
          </span>
          <ChevronDown
            className={`h-5 w-5 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="space-y-2">
            {feeItems.map((item, index) => (
              <div key={index} className="flex items-start justify-between text-sm">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{item.info}</span>
                </div>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {fees.currency} {item.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900 dark:text-gray-100">Total Fees</span>
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {fees.currency} {fees.total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
