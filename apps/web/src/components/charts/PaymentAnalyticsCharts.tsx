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

const COLORS = { xlm: '#6366f1', usdc: '#10b981', failed: '#ef4444', pending: '#f59e0b' };

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
  return <h2 className="mb-3 text-base font-semibold text-neutral-700">{children}</h2>;
}

export function PaymentVolumeChart({ data }: { data: RevenueByPeriod[] }) {
  const chartData = data.map((p) => ({
    period: p.period,
    XLM: parseFloat(p.xlm),
    USDC: parseFloat(p.usdc),
    count: p.count,
  }));

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <SectionTitle>Payment Volume Over Time</SectionTitle>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="xlmGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.xlm} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.xlm} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="usdcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.usdc} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.usdc} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Area
            type="monotone"
            dataKey="XLM"
            stroke={COLORS.xlm}
            fill="url(#xlmGrad)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="USDC"
            stroke={COLORS.usdc}
            fill="url(#usdcGrad)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TransactionCountChart({ data }: { data: RevenueByPeriod[] }) {
  const chartData = data.map((p) => ({ period: p.period, transactions: p.count }));

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <SectionTitle>Transaction Count Trend</SectionTitle>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="transactions"
            stroke={COLORS.xlm}
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
  const pieData = [
    { name: 'XLM', value: currencyDistribution.xlm.count },
    { name: 'USDC', value: currencyDistribution.usdc.count },
  ];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
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
              <Cell fill={COLORS.xlm} />
              <Cell fill={COLORS.usdc} />
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: COLORS.xlm }} />
            <span className="text-neutral-600">XLM</span>
            <span className="ml-auto font-medium">{currencyDistribution.xlm.count} txns</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: COLORS.usdc }} />
            <span className="text-neutral-600">USDC</span>
            <span className="ml-auto font-medium">{currencyDistribution.usdc.count} txns</span>
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
  const statusData = [
    { name: 'Confirmed', value: transactionCount.confirmed, fill: '#10b981' },
    { name: 'Pending', value: transactionCount.pending, fill: '#f59e0b' },
    { name: 'Failed', value: transactionCount.failed, fill: '#ef4444' },
  ];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <SectionTitle>Transaction Status Breakdown</SectionTitle>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={statusData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
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
  const feeData = [
    { name: 'Slow', value: feeStrategyBreakdown?.slow ?? 0, fill: '#10b981' },
    { name: 'Standard', value: feeStrategyBreakdown?.standard ?? 0, fill: '#6366f1' },
    { name: 'Fast', value: feeStrategyBreakdown?.fast ?? 0, fill: '#f59e0b' },
  ];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <SectionTitle>Fee Strategy Breakdown</SectionTitle>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={feeData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
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
