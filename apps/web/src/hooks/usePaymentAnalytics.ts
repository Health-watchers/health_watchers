'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RevenueByPeriod {
  period: string;
  xlm: string;
  usdc: string;
  usdEquivalent: string;
  count: number;
}

export interface DiagnosisByRevenue {
  code: string;
  description: string;
  totalRevenue: string;
  count: number;
}

export interface EncounterPaymentLink {
  paymentId: string;
  encounterId: string;
  patientId: string;
  patientName?: string;
  encounterDate: string;
  diagnosisCode?: string;
  diagnosisDescription?: string;
  amount: string;
  asset: string;
  status: string;
  confirmedAt?: string;
}

export interface PaymentAnalyticsData {
  // KPI fields
  totalCollected: string;
  totalOutstanding: string;
  totalRefunded: string;
  totalDisputed: string;
  // Legacy fields (kept for backward compat)
  totalRevenue: { xlm: string; usdc: string; usdEquivalent: string };
  transactionCount: { total: number; confirmed: number; pending: number; failed: number };
  successRate: number;
  averageTransactionValue: { xlm: string; usd: string };
  // Chart data
  revenueByPeriod: RevenueByPeriod[];
  currencyDistribution: {
    xlm: { count: number; amount: string };
    usdc: { count: number; amount: string };
  };
  feeStrategyBreakdown: { slow: number; standard: number; fast: number };
  topDiagnosesByRevenue: DiagnosisByRevenue[];
  encounterPaymentLinks: EncounterPaymentLink[];
}

export type DatePreset = '7d' | '30d' | '90d' | 'custom';
export type GroupBy = 'day' | 'week' | 'month';

export interface DateRange {
  from: string;
  to: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: Date): string {
  return d.toISOString().split('T')[0] ?? '';
}

export function presetToDateRange(preset: Exclude<DatePreset, 'custom'>): DateRange {
  const now = new Date();
  const to = fmt(now);
  if (preset === '7d') return { from: fmt(new Date(now.getTime() - 7 * 86_400_000)), to };
  if (preset === '30d') return { from: fmt(new Date(now.getTime() - 30 * 86_400_000)), to };
  // 90d
  return { from: fmt(new Date(now.getTime() - 90 * 86_400_000)), to };
}

async function fetchAnalytics(
  from: string,
  to: string,
  groupBy: GroupBy,
  clinicId?: string
): Promise<PaymentAnalyticsData> {
  const params = new URLSearchParams({
    from: `${from}T00:00:00Z`,
    to: `${to}T23:59:59Z`,
    groupBy,
  });
  if (clinicId) params.set('clinicId', clinicId);

  const res = await fetchWithAuth(`/api/payments/analytics?${params}`);
  if (!res.ok) throw new Error('Failed to load analytics');
  const body = await res.json();
  return body.data ?? body;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UsePaymentAnalyticsOptions {
  initialPreset?: DatePreset | undefined;
  initialGroupBy?: GroupBy | undefined;
  clinicId?: string | undefined;
}

export function usePaymentAnalytics({
  initialPreset = '30d',
  initialGroupBy = 'day',
  clinicId,
}: UsePaymentAnalyticsOptions = {}) {
  const [preset, setPreset] = useState<DatePreset>(initialPreset);
  const [groupBy, setGroupBy] = useState<GroupBy>(initialGroupBy);
  const [customRange, setCustomRange] = useState<DateRange>({
    from: fmt(new Date(Date.now() - 30 * 86_400_000)),
    to: fmt(new Date()),
  });

  const dateRange = useMemo<DateRange>(() => {
    if (preset === 'custom') return customRange;
    return presetToDateRange(preset);
  }, [preset, customRange]);

  const query = useQuery<PaymentAnalyticsData>({
    queryKey: queryKeys.payments.analytics({
      from: dateRange.from,
      to: dateRange.to,
      groupBy,
      clinicId: clinicId ?? '',
    }),
    queryFn: () => fetchAnalytics(dateRange.from, dateRange.to, groupBy, clinicId),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  return {
    ...query,
    // Filter state
    preset,
    setPreset,
    groupBy,
    setGroupBy,
    dateRange,
    customRange,
    setCustomRange,
  };
}
