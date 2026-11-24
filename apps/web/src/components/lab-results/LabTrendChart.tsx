'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { Badge, EmptyState, Select } from '@/components/ui';
import { ReferenceRangeIndicator } from './ReferenceRangeIndicator';
import { availableAnalytes, buildTrend } from '@/lib/lab-results/evaluation';
import { getAnalyteDefinitionOrNull, formatAnalyteValue } from '@/lib/lab-results/referenceRanges';
import type { AnalyteKey, LabResultSet, TrendDirection } from '@/lib/lab-results/types';

// ── Lazy-load recharts to keep the initial bundle lean ────────────────────────
const LineChart = dynamic(() => import('recharts').then((mod) => mod.LineChart), { ssr: false });
const Line = dynamic(() => import('recharts').then((mod) => mod.Line), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((mod) => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((mod) => mod.CartesianGrid), {
  ssr: false,
});
const Tooltip = dynamic(() => import('recharts').then((mod) => mod.Tooltip), { ssr: false });
const ReferenceArea = dynamic(() => import('recharts').then((mod) => mod.ReferenceArea), {
  ssr: false,
});
const ReferenceLine = dynamic(() => import('recharts').then((mod) => mod.ReferenceLine), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false }
);

const DIRECTION_LABELS: Record<TrendDirection, string> = {
  rising: 'Rising',
  falling: 'Falling',
  stable: 'Stable',
};

function directionVariant(direction: TrendDirection): 'danger' | 'warning' | 'success' {
  if (direction === 'rising') return 'danger';
  if (direction === 'falling') return 'warning';
  return 'success';
}

export interface LabTrendChartProps {
  sets: readonly LabResultSet[];
  analyte: AnalyteKey | null;
  onAnalyteChange: (analyte: AnalyteKey) => void;
}

/**
 * Issue #1313 — interactive trend chart.
 * Plots a single analyte against its normal range so a clinician can see both
 * the direction of travel and whether the patient is inside the range.
 */
export function LabTrendChart({ sets, analyte, onAnalyteChange }: LabTrendChartProps) {
  const available = useMemo(() => availableAnalytes(sets), [sets]);
  const trend = useMemo(() => (analyte ? buildTrend(sets, analyte) : null), [sets, analyte]);
  const definition = analyte ? getAnalyteDefinitionOrNull(analyte) : null;

  const data = useMemo(
    () =>
      (trend?.points ?? []).map((point) => ({
        label: point.date.slice(5),
        value: point.value,
        flag: point.flag,
      })),
    [trend]
  );

  if (available.length === 0) {
    return (
      <EmptyState
        title="No results to chart"
        description="Trend charts appear once a patient has at least one reported result."
      />
    );
  }

  const latestPoint = data.length > 0 ? data[data.length - 1] : null;

  return (
    <div className="space-y-4" role="region" aria-label="Lab trend chart">
      <div className="max-w-sm">
        <Select
          label="Analyte"
          options={available.map((key) => {
            const item = getAnalyteDefinitionOrNull(key);
            return { value: key, label: item ? item.name : key };
          })}
          value={analyte ?? available[0] ?? ''}
          onChange={(event) => onAnalyteChange(event.target.value as AnalyteKey)}
        />
      </div>

      {trend && definition && latestPoint && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full max-w-md">
            <ReferenceRangeIndicator
              definition={definition}
              value={latestPoint.value}
              flag={latestPoint.flag}
            />
          </div>
          <Badge variant={directionVariant(trend.direction)}>
            {DIRECTION_LABELS[trend.direction]} · {trend.change > 0 ? '+' : ''}
            {trend.change} {definition.unit} ({trend.percentChange}%)
          </Badge>
        </div>
      )}

      {data.length === 0 ? (
        <EmptyState
          title="No measurements for this analyte"
          description="Choose a different analyte to see its trend."
        />
      ) : (
        <div className="bg-neutral-0 dark:bg-neutral-900 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              {definition && (
                <ReferenceArea
                  y1={definition.low}
                  y2={definition.high}
                  fill="#10b981"
                  fillOpacity={0.08}
                />
              )}
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip />
              {definition && (
                <>
                  <ReferenceLine
                    y={definition.low}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    label={{ value: 'Low', position: 'insideTopLeft', fontSize: 10 }}
                  />
                  <ReferenceLine
                    y={definition.high}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    label={{ value: 'High', position: 'insideBottomLeft', fontSize: 10 }}
                  />
                </>
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 4 }}
                name={definition ? `${definition.name} (${definition.unit})` : 'Result'}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {trend && trend.points.length < 2 && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Only one result is available for this analyte, so a direction cannot be calculated.
        </p>
      )}

      {latestPoint && definition && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Latest result {formatAnalyteValue(definition, latestPoint.value)} {definition.unit} from{' '}
          {data.length} measurement{data.length === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}
