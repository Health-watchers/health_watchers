'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui';

const ResponsiveContainer = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false }
);

const LineChart = dynamic(() => import('recharts').then((mod) => mod.LineChart), { ssr: false });
const Line = dynamic(() => import('recharts').then((mod) => mod.Line), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((mod) => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((mod) => mod.CartesianGrid), {
  ssr: false,
});
const Tooltip = dynamic(() => import('recharts').then((mod) => mod.Tooltip), { ssr: false });

interface BalanceSnapshot {
  date: string;
  xlmBalance: string;
  usdcBalance: string | null;
}

function ChartSkeleton() {
  return <Skeleton className="h-[200px] w-full" />;
}

export function BalanceTrendChart({ snapshots }: { snapshots: BalanceSnapshot[] }) {
  if (!snapshots || snapshots.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-neutral-500">
        No balance history yet. Data will appear after the first monitoring cycle.
      </p>
    );
  }

  const chartData = snapshots.map((s) => ({
    date: new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    xlm: parseFloat(s.xlmBalance),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={50} />
        <Tooltip formatter={(v: number) => [`${v.toFixed(2)} XLM`, 'Balance']} />
        <Line
          type="monotone"
          dataKey="xlm"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default BalanceTrendChart;
