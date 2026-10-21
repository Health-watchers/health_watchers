'use client';

/**
 * PaymentAnalyticsClient — comprehensive payment analytics dashboard.
 * Composes all analytics components into a single cohesive view.
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { PageWrapper, PageHeader, SectionErrorBoundary } from '@/components/ui';
import { usePaymentAnalytics } from '@/hooks/usePaymentAnalytics';
import { KpiRow } from '@/components/payments/KpiRow';
import { DateRangeFilter } from '@/components/payments/DateRangeFilter';
import { AnalyticsExportButton } from '@/components/payments/AnalyticsExportButton';
import { PaymentEncounterTable } from '@/components/payments/PaymentEncounterTable';
import {
  ChartSkeleton,
  RevenueOverTimeChart,
  PaymentMethodBreakdownChart,
  TopDiagnosesByRevenueChart,
} from '@/components/charts/AnalyticsCharts';

// Legacy charts loaded lazily
const TransactionStatusChart = dynamic(
  () => import('@/components/charts/PaymentAnalyticsCharts').then((m) => m.TransactionStatusChart),
  { ssr: false }
);
const FeeStrategyChart = dynamic(
  () => import('@/components/charts/PaymentAnalyticsCharts').then((m) => m.FeeStrategyChart),
  { ssr: false }
);

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold tracking-wide text-neutral-400 uppercase">
      {children}
    </h2>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <span>Failed to load analytics. Please check your connection and try again.</span>
      <button
        onClick={onRetry}
        className="ml-4 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 focus:ring-2 focus:ring-red-400 focus:outline-none"
      >
        Retry
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PaymentAnalyticsClient() {
  const [clinicId, setClinicId] = useState('');
  // TODO: derive from auth context – show clinic filter only for SUPER_ADMIN
  const showClinicFilter = true;

  const clinicIdOption = clinicId !== '' ? clinicId : undefined;

  const {
    data,
    isLoading,
    error,
    refetch,
    preset,
    setPreset,
    groupBy,
    setGroupBy,
    dateRange,
    customRange,
    setCustomRange,
  } = usePaymentAnalytics({ clinicId: clinicIdOption });

  return (
    <PageWrapper className="py-8">
      {/* Header row */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Payment Analytics" subtitle={`${dateRange.from} → ${dateRange.to}`} />

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
        </div>
      </div>

      {/* Error state */}
      {error && <ErrorBanner onRetry={refetch} />}

      {/* Content */}
      <div className="space-y-8">
        {/* KPI Row */}
        <SectionErrorBoundary name="KPI row">
          <KpiRow data={data ?? undefined} isLoading={isLoading} />
        </SectionErrorBoundary>

        {/* Revenue over time */}
        <SectionErrorBoundary name="revenue chart">
          {isLoading ? (
            <ChartSkeleton height={300} />
          ) : data?.revenueByPeriod?.length ? (
            <>
              <SectionHeading>Revenue over time</SectionHeading>
              <RevenueOverTimeChart data={data.revenueByPeriod} />
            </>
          ) : null}
        </SectionErrorBoundary>

        {/* Payment method + Transaction status */}
        {(isLoading || data) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SectionErrorBoundary name="payment method breakdown">
              {isLoading ? (
                <ChartSkeleton height={260} />
              ) : data?.currencyDistribution ? (
                <PaymentMethodBreakdownChart currencyDistribution={data.currencyDistribution} />
              ) : null}
            </SectionErrorBoundary>

            <SectionErrorBoundary name="transaction status">
              {isLoading ? (
                <ChartSkeleton height={260} />
              ) : data?.transactionCount ? (
                <TransactionStatusChart transactionCount={data.transactionCount} />
              ) : null}
            </SectionErrorBoundary>
          </div>
        )}

        {/* Top diagnoses by revenue */}
        <SectionErrorBoundary name="diagnoses chart">
          {isLoading ? (
            <ChartSkeleton height={300} />
          ) : data ? (
            <>
              <SectionHeading>Top diagnoses by revenue</SectionHeading>
              <TopDiagnosesByRevenueChart data={data.topDiagnosesByRevenue ?? []} />
            </>
          ) : null}
        </SectionErrorBoundary>

        {/* Fee strategy */}
        <SectionErrorBoundary name="fee strategy chart">
          {!isLoading && data?.feeStrategyBreakdown ? (
            <>
              <SectionHeading>Fee strategy breakdown</SectionHeading>
              <FeeStrategyChart feeStrategyBreakdown={data.feeStrategyBreakdown} />
            </>
          ) : null}
        </SectionErrorBoundary>

        {/* Payment ↔ Encounter linkage table */}
        <SectionErrorBoundary name="encounter payment table">
          <div>
            <SectionHeading>Payment to encounter linkage</SectionHeading>
            <PaymentEncounterTable
              data={data?.encounterPaymentLinks ?? undefined}
              isLoading={isLoading}
            />
          </div>
        </SectionErrorBoundary>
      </div>
    </PageWrapper>
  );
}
