'use client';

/**
 * Analytics-specific chart components for the Payment Analytics dashboard.
 * All charts use accessible colour palettes and include legends.
 */

import dynamic from 'next/dynamic';
import type { RevenueByPeriod, DiagnosisByRevenue } from '@/hooks/usePaymentAnalytics';

// ── Lazy Recharts imports (SSR-safe) ──────────────────────────────────────────

const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), {
  ssr: false,
});
const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then((m) => m.Area), { ssr: false });
const BarChart = dynamic(() => import('recharts').then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false });
const Cell = dynamic(() => import('recharts').then((m) => m.Cell), { ssr: false });
const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((m) => m.CartesianGrid), {
  ssr: false,
});
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const Legend = dynamic(() => import('recharts').then((m) => m.Legend), { ssr: false });

// ── Accessible colour palette (WCAG AA contrast-safe) ────────────────────────

export const CHART_COLORS = {
  /** Indigo – revenue / XLM */
  indigo: '#6366f1',
  /** Emerald – USDC / collected */
  emerald: '#10b981',
  /** Amber – outstanding / pending */
  amber: '#f59e0b',
  /** Rose – disputed / failed */
  rose: '#f43f5e',
  /** Sky – refunded */
  sky: '#0ea5e9',
  /** Violet – additional series */
  violet: '#8b5cf6',
  /** Teal */
  teal: '#14b8a6',
  /** Orange */
  orange: '#f97316',
};

const PIE_PALETTE = [
  CHART_COLORS.indigo,
  CHART_COLORS.emerald,
  CHART_COLORS.amber,
  CHART_COLORS.rose,
  CHART_COLORS.sky,
  CHART_COLORS.violet,
  CHART_COLORS.teal,
  CHART_COLORS.orange,
];

// ── Shared internals ──────────────────────────────────────────────────────────

function ChartCard({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-neutral-200 bg-white p-5 shadow-sm ${className}`}>
      <h2 className="mb-4 text-base font-semibold text-neutral-700">{title}</h2>
      {children}
    </div>
  );
}

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-lg bg-neutral-100"
      style={{ height }}
      role="status"
      aria-label="Loading chart"
    />
  );
}

// ── 1. Revenue Over Time ──────────────────────────────────────────────────────

interface RevenueOverTimeChartProps {
  data: RevenueByPeriod[];
  height?: number;
}

export function RevenueOverTimeChart({ data, height = 280 }: RevenueOverTimeChartProps) {
  const chartData = data.map((p) => ({
    period: p.period,
    'USD Equiv.': parseFloat(p.usdEquivalent),
    XLM: parseFloat(p.xlm),
    USDC: parseFloat(p.usdc),
  }));

  return (
    <ChartCard title="Revenue Over Time" className="col-span-full">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradRevUsd" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.indigo} stopOpacity={0.25} />
              <stop offset="95%" stopColor={CHART_COLORS.indigo} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradRevXlm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.emerald} stopOpacity={0.2} />
              <stop offset="95%" stopColor={CHART_COLORS.emerald} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradRevUsdc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.sky} stopOpacity={0.2} />
              <stop offset="95%" stopColor={CHART_COLORS.sky} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Area
            type="monotone"
            dataKey="USD Equiv."
            stroke={CHART_COLORS.indigo}
            fill="url(#gradRevUsd)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="XLM"
            stroke={CHART_COLORS.emerald}
            fill="url(#gradRevXlm)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="USDC"
            stroke={CHART_COLORS.sky}
            fill="url(#gradRevUsdc)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── 2. Payment Method Breakdown ───────────────────────────────────────────────

interface PaymentMethodBreakdownChartProps {
  currencyDistribution: {
    xlm: { count: number; amount: string };
    usdc: { count: number; amount: string };
  };
  height?: number;
}

export function PaymentMethodBreakdownChart({
  currencyDistribution,
  height = 240,
}: PaymentMethodBreakdownChartProps) {
  const pieData = [
    {
      name: 'XLM',
      value: currencyDistribution.xlm.count,
    },
    {
      name: 'USDC',
      value: currencyDistribution.usdc.count,
    },
  ];

  const total = pieData.reduce((s, d) => s + d.value, 0);

  return (
    <ChartCard title="Payment Method Breakdown">
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <ResponsiveContainer width="55%" height={height}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
              aria-label="Payment method distribution pie chart"
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length] as string} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>

        {/* Accessible legend table */}
        <div className="flex-1 space-y-3 text-sm" aria-label="Payment method legend">
          {pieData.map((d, i) => (
            <div
              key={d.name}
              className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2"
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: PIE_PALETTE[i % PIE_PALETTE.length] }}
                  aria-hidden="true"
                />
                <span className="font-medium text-neutral-700">{d.name}</span>
              </span>
              <span className="text-neutral-500">
                {d.value.toLocaleString()} txns
                {total > 0 && (
                  <span className="ml-1 text-xs text-neutral-400">
                    ({((d.value / total) * 100).toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

// ── 3. Top Diagnoses by Revenue ───────────────────────────────────────────────

interface TopDiagnosesByRevenueChartProps {
  data: DiagnosisByRevenue[];
  height?: number;
}

export function TopDiagnosesByRevenueChart({
  data,
  height = 280,
}: TopDiagnosesByRevenueChartProps) {
  // Show up to top 8
  const chartData = data.slice(0, 8).map((d) => ({
    name: d.code,
    label: d.description.length > 24 ? `${d.description.slice(0, 22)}…` : d.description,
    revenue: parseFloat(d.totalRevenue),
    count: d.count,
  }));

  if (chartData.length === 0) {
    return (
      <ChartCard title="Top Diagnoses by Revenue">
        <p className="py-8 text-center text-sm text-neutral-400">
          No diagnosis revenue data available for this period.
        </p>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Top Diagnoses by Revenue" className="col-span-full">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 32, left: 80, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `$${v.toLocaleString()}`}
          />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={76} />
          <Tooltip />
          <Legend />
          <Bar dataKey="revenue" name="Revenue (USD)" radius={[0, 4, 4, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length] as string} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Re-export legacy charts (unchanged) ──────────────────────────────────────

export {
  PaymentVolumeChart,
  TransactionCountChart,
  AssetDistributionChart,
  TransactionStatusChart,
  FeeStrategyChart,
} from './PaymentAnalyticsCharts';
