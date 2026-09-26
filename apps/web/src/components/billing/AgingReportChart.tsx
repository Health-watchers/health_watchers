'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Skeleton } from '@/components/ui';
import type { AgingBucket } from '@/lib/billing';

const ResponsiveContainer = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false }
);
const BarChart = dynamic(() => import('recharts').then((mod) => mod.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then((mod) => mod.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((mod) => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((mod) => mod.CartesianGrid), {
  ssr: false,
});
const Tooltip = dynamic(() => import('recharts').then((mod) => mod.Tooltip), { ssr: false });

// Single series (magnitude) → one hue, no legend; the title names the measure
const BAR_COLOR = '#6366f1';
const GRID_COLOR = '#e5e7eb';
const AXIS_TEXT = '#6b7280';

interface Props {
  buckets: AgingBucket[] | undefined;
  isLoading: boolean;
}

export function AgingReportChart({ buckets, isLoading }: Props) {
  const [showTable, setShowTable] = useState(false);

  if (isLoading) return <Skeleton className="h-[240px] w-full" />;
  if (!buckets) return null;

  const data = buckets.map((b) => ({
    label: b.label,
    count: b.encounters.length,
    oldest: b.encounters.reduce((max, e) => Math.max(max, e.daysUnbilled), 0),
  }));
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <figure className="rounded-lg border border-neutral-200 bg-white p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-neutral-800">Unbilled A/R aging</h2>
          <p className="text-xs text-neutral-500">
            {total} unbilled encounter{total === 1 ? '' : 's'} by days since service
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-xs text-primary-600 hover:underline"
          aria-pressed={showTable}
        >
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </figcaption>

      {showTable ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th scope="col" className="py-1">Bucket</th>
              <th scope="col" className="py-1 text-right">Encounters</th>
              <th scope="col" className="py-1 text-right">Oldest (days)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t border-neutral-100">
                <td className="py-1.5">{d.label}</td>
                <td className="py-1.5 text-right tabular-nums">{d.count}</td>
                <td className="py-1.5 text-right tabular-nums">{d.count ? d.oldest : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-[220px]" role="img" aria-label={`Aging: ${data.map((d) => `${d.label} ${d.count}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: GRID_COLOR }}
                tick={{ fontSize: 12, fill: AXIS_TEXT }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: AXIS_TEXT }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                formatter={(value) => [value, 'Encounters']}
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
              />
              <Bar dataKey="count" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}
