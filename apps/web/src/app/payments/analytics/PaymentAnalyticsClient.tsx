'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { PageWrapper, PageHeader } from '@/components/ui';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';

const PaymentVolumeChart = dynamic(
  () => import('@/components/charts/PaymentAnalyticsCharts').then((mod) => mod.PaymentVolumeChart),
  { ssr: false }
);

const TransactionCountChart = dynamic(
  () =>
    import('@/components/charts/PaymentAnalyticsCharts').then((mod) => mod.TransactionCountChart),
  { ssr: false }
);

const AssetDistributionChart = dynamic(
  () =>
    import('@/components/charts/PaymentAnalyticsCharts').then((mod) => mod.AssetDistributionChart),
  { ssr: false }
);

const TransactionStatusChart = dynamic(
  () =>
    import('@/components/charts/PaymentAnalyticsCharts').then((mod) => mod.TransactionStatusChart),
  { ssr: false }
);

const FeeStrategyChart = dynamic(
  () => import('@/components/charts/PaymentAnalyticsCharts').then((mod) => mod.FeeStrategyChart),
  { ssr: false }
);

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
  feeStrategyBreakdown: { slow: number; standard: number; fast: number };
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
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 py-12 text-neutral-500"
        >
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700"
            aria-hidden="true"
          />
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
          <PaymentVolumeChart data={data.revenueByPeriod} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Transaction count trend */}
            <TransactionCountChart data={data.revenueByPeriod} />

            {/* Asset distribution */}
            <AssetDistributionChart currencyDistribution={data.currencyDistribution} />
          </div>

          {/* Transaction status breakdown */}
          <TransactionStatusChart transactionCount={data.transactionCount} />

          {/* Fee strategy breakdown */}
          <FeeStrategyChart feeStrategyBreakdown={data.feeStrategyBreakdown} />
        </div>
      )}
    </PageWrapper>
  );
}
