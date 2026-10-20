'use client';

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
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
const PieChart = dynamic(() => import('recharts').then((mod) => mod.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then((mod) => mod.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then((mod) => mod.Cell), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((mod) => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((mod) => mod.CartesianGrid), {
  ssr: false,
});
const Tooltip = dynamic(() => import('recharts').then((mod) => mod.Tooltip), { ssr: false });
const Legend = dynamic(() => import('recharts').then((mod) => mod.Legend), { ssr: false });

const LIGHT_COLORS = {
  xlm: '#6366f1',
  usdc: '#10b981',
  failed: '#ef4444',
  pending: '#f59e0b',
  grid: '#f0f0f0',
  axis: '#737373',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e5e5e5',
  tooltipText: '#171717',
};

const DARK_COLORS = {
  xlm: '#818cf8',
  usdc: '#34d399',
  failed: '#f87171',
  pending: '#fbbf24',
  grid: '#404040',
  axis: '#a3a3a3',
  tooltipBg: '#171717',
  tooltipBorder: '#404040',
  tooltipText: '#f5f5f5',
};

function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;
  const tooltipProps = {
    contentStyle: {
      backgroundColor: colors.tooltipBg,
      border: `1px solid ${colors.tooltipBorder}`,
      borderRadius: 8,
      color: colors.tooltipText,
    },
    labelStyle: { color: colors.tooltipText },
    itemStyle: { color: colors.tooltipText },
  };
  return { isDark, colors, tooltipProps };
}

function ChartSkeleton({ height = 260 }: { height?: number }) {
  return <Skeleton className={`h-[${height}px] w-full`} />;
}

interface RevenueByPeriod {
  period: string;
  xlm: string;
  usdc: string;
  usdEquivalent: string;
  count: number;
}

interface PaymentAnalytics {
  totalRevenue: { xlm: string; usdc: string; usdEquivalent: string };
  transactionCount: { total: number; confirmed: number; pending: number; failed: number };
  successRate: number;
  averageTransactionValue: { xlm: string; usd: string };
  revenueByPeriod: RevenueByPeriod[];
  currencyDistribution: {
    xlm: { count: number; amount: string };
    usdc: { count: number; amount: string };
  };
  feeStrategyBreakdown: { slow: number; standard: number; fast: number };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-base font-semibold text-neutral-700 dark:text-neutral-200">
      {children}
    </h2>
  );
}

export function PaymentVolumeChart({ data }: { data: RevenueByPeriod[] }) {
  const { colors, tooltipProps } = useChartTheme();
  const chartData = data.map((p) => ({
    period: p.period,
    XLM: parseFloat(p.xlm),
    USDC: parseFloat(p.usdc),
    count: p.count,
  }));

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <SectionTitle>Payment Volume Over Time</SectionTitle>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="xlmGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.xlm} stopOpacity={0.3} />
              <stop offset="95%" stopColor={colors.xlm} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="usdcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.usdc} stopOpacity={0.3} />
              <stop offset="95%" stopColor={colors.usdc} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: colors.axis }} />
          <YAxis tick={{ fontSize: 11, fill: colors.axis }} />
          <Tooltip {...tooltipProps} />
          <Legend />
          <Area
            type="monotone"
            dataKey="XLM"
            stroke={colors.xlm}
            fill="url(#xlmGrad)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="USDC"
            stroke={colors.usdc}
            fill="url(#usdcGrad)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TransactionCountChart({ data }: { data: RevenueByPeriod[] }) {
  const { colors, tooltipProps } = useChartTheme();
  const chartData = data.map((p) => ({ period: p.period, transactions: p.count }));

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <SectionTitle>Transaction Count Trend</SectionTitle>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: colors.axis }} />
          <YAxis tick={{ fontSize: 11, fill: colors.axis }} />
          <Tooltip {...tooltipProps} />
          <Line
            type="monotone"
            dataKey="transactions"
            stroke={colors.xlm}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AssetDistributionChart({
  currencyDistribution,
}: {
  currencyDistribution: { xlm: { count: number }; usdc: { count: number } };
}) {
  const { colors, tooltipProps } = useChartTheme();
  const pieData = [
    { name: 'XLM', value: currencyDistribution.xlm.count },
    { name: 'USDC', value: currencyDistribution.usdc.count },
  ];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <SectionTitle>Asset Distribution</SectionTitle>
      <div className="flex items-center gap-6">
        <ResponsiveContainer width="50%" height={220}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
            >
              <Cell fill={colors.xlm} />
              <Cell fill={colors.usdc} />
            </Pie>
            <Tooltip {...tooltipProps} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: colors.xlm }} />
            <span className="text-neutral-600 dark:text-neutral-300">XLM</span>
            <span className="ml-auto font-medium dark:text-neutral-100">
              {currencyDistribution.xlm.count} txns
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: colors.usdc }} />
            <span className="text-neutral-600 dark:text-neutral-300">USDC</span>
            <span className="ml-auto font-medium dark:text-neutral-100">
              {currencyDistribution.usdc.count} txns
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TransactionStatusChart({
  transactionCount,
}: {
  transactionCount: { confirmed: number; pending: number; failed: number };
}) {
  const { colors, tooltipProps } = useChartTheme();
  const statusData = [
    { name: 'Confirmed', value: transactionCount.confirmed, fill: colors.usdc },
    { name: 'Pending', value: transactionCount.pending, fill: colors.pending },
    { name: 'Failed', value: transactionCount.failed, fill: colors.failed },
  ];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <SectionTitle>Transaction Status Breakdown</SectionTitle>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={statusData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: colors.axis }} />
          <YAxis tick={{ fontSize: 11, fill: colors.axis }} />
          <Tooltip {...tooltipProps} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {statusData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FeeStrategyChart({
  feeStrategyBreakdown,
}: {
  feeStrategyBreakdown: { slow: number; standard: number; fast: number };
}) {
  const { colors, tooltipProps } = useChartTheme();
  const feeData = [
    { name: 'Slow', value: feeStrategyBreakdown?.slow ?? 0, fill: colors.usdc },
    { name: 'Standard', value: feeStrategyBreakdown?.standard ?? 0, fill: colors.xlm },
    { name: 'Fast', value: feeStrategyBreakdown?.fast ?? 0, fill: colors.pending },
  ];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <SectionTitle>Fee Strategy Breakdown</SectionTitle>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={feeData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: colors.axis }} />
          <YAxis tick={{ fontSize: 11, fill: colors.axis }} />
          <Tooltip {...tooltipProps} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {feeData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
