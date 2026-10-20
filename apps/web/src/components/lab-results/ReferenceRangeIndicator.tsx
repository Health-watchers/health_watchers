'use client';

import type { AnalyteDefinition, ResultFlag } from '@/lib/lab-results/types';
import { formatAnalyteValue, formatReferenceRange } from '@/lib/lab-results/referenceRanges';

export interface ReferenceRangeIndicatorProps {
  definition: AnalyteDefinition;
  value: number;
  flag: ResultFlag;
}

interface Scale {
  min: number;
  max: number;
}

/** Chart scale that always contains the critical limits as well as the range. */
export function scaleFor(definition: AnalyteDefinition): Scale {
  const min = definition.criticalLow ?? definition.low;
  const max = definition.criticalHigh ?? definition.high;
  const padding = (max - min) * 0.1 || 1;
  return { min: min - padding, max: max + padding };
}

function percentPosition(value: number, scale: Scale): number {
  const span = scale.max - scale.min;
  if (span <= 0) return 50;
  const raw = ((value - scale.min) / span) * 100;
  return Math.min(Math.max(raw, 0), 100);
}

function widthBetween(low: number, high: number, scale: Scale): number {
  return Math.max(percentPosition(high, scale) - percentPosition(low, scale), 1);
}

function markerClasses(flag: ResultFlag): string {
  if (flag === 'critical_low' || flag === 'critical_high') return 'bg-danger-600';
  if (flag === 'low' || flag === 'high') return 'bg-warning-500';
  return 'bg-success-500';
}

/**
 * Issue #1313 — normal range indicator.
 * Renders the reference interval, the critical zones either side of it and a
 * marker for the measured value, so a number is readable without the table.
 */
export function ReferenceRangeIndicator({
  definition,
  value,
  flag,
}: ReferenceRangeIndicatorProps) {
  const scale = scaleFor(definition);
  const normalWidth = widthBetween(definition.low, definition.high, scale);
  const normalLeft = percentPosition(definition.low, scale);
  const marker = percentPosition(value, scale);
  const formatted = formatAnalyteValue(definition, value);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs text-neutral-600 dark:text-neutral-400">
        <span className="font-semibold text-neutral-900 dark:text-neutral-100">
          {formatted}
          {definition.unit ? ` ${definition.unit}` : ''}
        </span>
        <span>Reference {formatReferenceRange(definition)}</span>
      </div>

      <div
        className="relative h-2 rounded-full bg-neutral-100 dark:bg-neutral-800"
        role="img"
        aria-label={`${definition.name} ${formatted} against a reference range of ${formatReferenceRange(definition)}`}
      >
        {definition.criticalLow !== null && (
          <span
            className="absolute inset-y-0 left-0 rounded-l-full bg-danger-200 dark:bg-danger-900/40"
            style={{ width: `${percentPosition(definition.criticalLow, scale)}%` }}
          />
        )}
        {definition.criticalHigh !== null && (
          <span
            className="absolute inset-y-0 right-0 rounded-r-full bg-danger-200 dark:bg-danger-900/40"
            style={{ width: `${percentPosition(definition.criticalHigh, scale)}%` }}
          />
        )}
        <span
          className="absolute inset-y-0 rounded-full bg-success-200 dark:bg-success-900/40"
          style={{ left: `${normalLeft}%`, width: `${normalWidth}%` }}
        />
        <span
          className={[
            'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full',
            markerClasses(flag),
          ].join(' ')}
          style={{ left: `${marker}%` }}
        />
      </div>
    </div>
  );
}
