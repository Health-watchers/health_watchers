'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui';

const ResponsiveContainer = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false }
);
const AreaChart = dynamic(() => import('recharts').then((mod) => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then((mod) => mod.Area), { ssr: false });
const BarChart = dynamic(() => import('recharts').then((mod) => mod.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then((mod) => mod.Bar), { ssr: false });
const LineChart = dynamic(() => import('recharts').then((mod) => mod.LineChart), { ssr: false });
const Line = dynamic(() => import('recharts').then((mod) => mod.Line), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((mod) => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((mod) => mod.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((mod) => mod.Tooltip), { ssr: false });
const Legend = dynamic(() => import('recharts').then((mod) => mod.Legend), { ssr: false });

interface ChartCardProps {
  title: string;
  onExport?: () => void;
  children: React.ReactNode;
}

function ChartCard({ title, onExport, children }: ChartCardProps) {
  return (
    <section
      aria-label={title}
      className="rounded-lg border border-neutral-200 bg-white p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        {onExport && (
          <button
            onClick={onExport}
            className="text-primary-600 text-xs hover:underline focus:underline focus:outline-none"
            aria-label="Export data as CSV"
          >
            Export CSV
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export function EncountersPerDayChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data?.length) return <p className="text-sm text-neutral-500">No data available</p>;

  return (
    <ChartCard title="Encounters Per Day">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="encountersGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#6366f1"
            fill="url(#encountersGrad)"
            strokeWidth={2}
            name="Encounters"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function RevenueTrendChart({ data }: { data: { period: string; revenue: number }[] }) {
  if (!data?.length) return <p className="text-sm text-neutral-500">No data available</p>;

  return (
    <ChartCard title="Revenue Trend">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 4 }}
            name="Revenue (XLM)"
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function TopDiagnosesChart({
  data,
  onExport,
}: {
  data: { diagnosis: string; count: number }[];
  onExport?: () => void;
}) {
  if (!data?.length) return <p className="text-sm text-neutral-500">No data available</p>;

  return (
    <ChartCard title="Top Diagnoses" onExport={onExport}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data.slice(0, 10)}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 80, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="diagnosis"
            tick={{ fontSize: 10 }}
            width={75}
          />
          <Tooltip />
          <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Count" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
