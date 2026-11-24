'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatPeriod, type SurveyTrendPoint, type TrendBucket } from './surveyTrend.utils';

interface Props {
  data: SurveyTrendPoint[];
  metric: 'nps' | 'csat';
  bucket: TrendBucket;
}

const METRIC = {
  nps: { domain: [-100, 100] as [number, number], ticks: [-100, -50, 0, 50, 100], suffix: '' },
  csat: { domain: [0, 100] as [number, number], ticks: [0, 25, 50, 75, 100], suffix: '%' },
};

function TrendTooltip({
  active,
  payload,
  metric,
  bucket,
}: {
  active?: boolean;
  payload?: Array<{ payload: SurveyTrendPoint }>;
  metric: Props['metric'];
  bucket: Props['bucket'];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const value = p[metric];
  const label =
    bucket === 'week' ? `Week of ${formatPeriod(p.period, 'day')}` : formatPeriod(p.period, bucket);
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md dark:border-neutral-700 dark:bg-neutral-800">
      <p className="font-medium text-neutral-900 dark:text-neutral-100">{label}</p>
      <p className="mt-1 text-neutral-700 dark:text-neutral-200">
        {metric === 'nps' ? 'NPS' : 'CSAT'}:{' '}
        <span className="font-semibold tabular-nums">
          {value === null
            ? 'No responses'
            : `${value > 0 && metric === 'nps' ? '+' : ''}${value}${METRIC[metric].suffix}`}
        </span>
      </p>
      <p className="text-neutral-500 dark:text-neutral-400">
        {p.responses} response{p.responses === 1 ? '' : 's'}
      </p>
    </div>
  );
}

/**
 * Single-series trend line. NPS and CSAT live on different scales, so the dashboard renders
 * one of these per metric (small multiples) rather than a dual-axis chart. Periods with no
 * responses are left as gaps instead of being interpolated.
 */
export default function SurveyTrendChart({ data, metric, bucket }: Props) {
  const { domain, ticks, suffix } = METRIC[metric];
  const sparse = data.length > 40;

  return (
    // The line inherits `currentColor`, so light/dark steps come from the design tokens
    <div className="text-primary-600 dark:text-primary-500 h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} className="stroke-neutral-200 dark:stroke-neutral-700" />
          <XAxis
            dataKey="period"
            tickFormatter={(v: string) => formatPeriod(v, bucket)}
            tick={{ fontSize: 11, fill: 'currentColor' }}
            className="text-neutral-500 dark:text-neutral-400"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={domain}
            ticks={ticks}
            tickFormatter={(v: number) => `${v}${suffix}`}
            tick={{ fontSize: 11, fill: 'currentColor' }}
            className="text-neutral-500 dark:text-neutral-400"
            tickLine={false}
            axisLine={false}
            width={44}
          />
          {metric === 'nps' && (
            <ReferenceLine y={0} className="stroke-neutral-400 dark:stroke-neutral-500" />
          )}
          <Tooltip
            cursor={{ stroke: 'currentColor', strokeOpacity: 0.3, strokeWidth: 1 }}
            content={<TrendTooltip metric={metric} bucket={bucket} />}
          />
          <Line
            type="linear"
            dataKey={metric}
            stroke="currentColor"
            strokeWidth={2}
            connectNulls={false}
            dot={
              sparse
                ? false
                : {
                    r: 4,
                    strokeWidth: 2,
                    fill: 'currentColor',
                    stroke: 'var(--color-neutral-0, #fff)',
                  }
            }
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--color-neutral-0, #fff)' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
