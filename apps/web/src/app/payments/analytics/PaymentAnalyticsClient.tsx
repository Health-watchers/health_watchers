'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { PageWrapper, PageHeader } from '@/components/ui';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

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
}

type GroupBy = 'day' | 'week' | 'month';

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLORS = { xlm: '#6366f1', usdc: '#10b981', failed: '#ef4444', pending: '#f59e0b' };

function fmt(d: Date) {
  return d.toISOString().split('T')[0];
}

function getPresetDates(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = fmt(now);
  if (preset === '7d') return { from: fmt(new Date(now.getTime() - 7 * 86400000)), to };
  if (preset === '30d') return { from: fmt(new Date(now.getTime() - 30 * 86400000)), to };
  if (preset === '90d') return { from: fmt(new Date(now.getTime() - 90 * 86400000)), to };
  // 12m
  const start = new Date(now);
  start.setMonth(start.getMonth() - 12);
  return { from: fmt(start), to };
}

async function fetchAnalytics(
  from: string,
  to: string,
  groupBy: GroupBy,
  clinicId?: string
): Promise<PaymentAnalytics> {
  const params = new URLSearchParams({ from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z`, groupBy });
  if (clinicId) params.set('clinicId', clinicId);
  const res = await fetchWithAuth(`/api/payments/analytics?${params}`);
  if (!res.ok) throw new Error('Failed to load analytics');
  return (await res.json()).data;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-base font-semibold text-neutral-700">{children}</h2>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PaymentAnalyticsClient() {
  const [preset, setPreset] = useState('30d');
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [clinicId, setClinicId] = useState('');

  const { from, to } = getPresetDates(preset);

  const { data, isLoading, error } = useQuery<PaymentAnalytics>({
    queryKey: queryKeys.payments.analytics({ from, to, groupBy, clinicId }),
    queryFn: () => fetchAnalytics(from, to, groupBy, clinicId || undefined),
  });

  // Prepare chart data
  const volumeData = (data?.revenueByPeriod ?? []).map((p) => ({
    period: p.period,
    XLM: parseFloat(p.xlm),
    USDC: parseFloat(p.usdc),
    count: p.count,
  }));

  const successRateData = (data?.revenueByPeriod ?? []).map((p, i, arr) => {
    // We don't have per-period success rate from the API, so we show count trend
    return { period: p.period, transactions: p.count };
  });

  const pieData = data
    ? [
        { name: 'XLM', value: data.currencyDistribution.xlm.count },
        { name: 'USDC', value: data.currencyDistribution.usdc.count },
      ]
    : [];

  const statusData = data
    ? [
        { name: 'Confirmed', value: data.transactionCount.confirmed, fill: '#10b981' },
        { name: 'Pending', value: data.transactionCount.pending, fill: '#f59e0b' },
        { name: 'Failed', value: data.transactionCount.failed, fill: '#ef4444' },
      ]
    : [];

  return (
    <PageWrapper className="py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Payment Analytics" />
        <div className="flex flex-wrap items-center gap-2">
          {/* Clinic filter (SUPER_ADMIN) */}
          <input
            type="text"
            placeholder="Clinic ID (admin only)"
            value={clinicId}
            onChange={(e) => setClinicId(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {/* Date preset */}
          {(['7d', '30d', '90d', '12m'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                preset === p
                  ? 'bg-indigo-600 text-white'
                  : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              {p}
            </button>
          ))}
          {/* Group by */}
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
          {/* CSV export */}
          <a
            href={`/api/payments/analytics/export?from=${from}T00:00:00Z&to=${to}T23:59:59Z&groupBy=${groupBy}${clinicId ? `&clinicId=${clinicId}` : ''}`}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Export CSV
          </a>
        </div>
      </div>

      {isLoading && (
        <div role="status" aria-live="polite" className="flex items-center gap-3 py-12 text-neutral-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" aria-hidden="true" />
          <span>Loading analytics…</span>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load analytics. Please try again.
        </p>
      )}

      {data && (
        <div className="space-y-8">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Total Revenue (USD)"
              value={`$${parseFloat(data.totalRevenue.usdEquivalent).toLocaleString()}`}
              sub={`${data.totalRevenue.xlm} XLM + ${data.totalRevenue.usdc} USDC`}
            />
            <StatCard
              label="Total Transactions"
              value={data.transactionCount.total.toLocaleString()}
              sub={`${data.transactionCount.confirmed} confirmed`}
            />
            <StatCard
              label="Success Rate"
              value={`${data.successRate}%`}
              sub={`${data.transactionCount.failed} failed`}
            />
            <StatCard
              label="Avg Transaction"
              value={`$${data.averageTransactionValue.usd}`}
              sub={`${data.averageTransactionValue.xlm} XLM`}
            />
          </div>

          {/* Payment volume over time */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <SectionTitle>Payment Volume Over Time</SectionTitle>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={volumeData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
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
                <Area type="monotone" dataKey="XLM" stroke={COLORS.xlm} fill="url(#xlmGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="USDC" stroke={COLORS.usdc} fill="url(#usdcGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Transaction count trend */}
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <SectionTitle>Transaction Count Trend</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={successRateData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="transactions" stroke={COLORS.xlm} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Asset distribution */}
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
                    <span className="ml-auto font-medium">{data.currencyDistribution.xlm.count} txns</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: COLORS.usdc }} />
                    <span className="text-neutral-600">USDC</span>
                    <span className="ml-auto font-medium">{data.currencyDistribution.usdc.count} txns</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Transaction status breakdown */}
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
        </div>
      )}
    </PageWrapper>
  );
}
