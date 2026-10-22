'use client';

import type { PaymentAnalyticsData } from '@/hooks/usePaymentAnalytics';
import { Skeleton } from '@/components/ui';

// ── Types ─────────────────────────────────────────────────────────────────────

interface KpiItem {
  label: string;
  value: string;
  sub?: string;
  /** Tailwind background colour class for the icon badge */
  color: string;
  icon: React.ReactNode;
  /** Accessible description */
  description?: string;
}

// ── Icon helpers (inline SVG, no external dep) ────────────────────────────────

function CheckCircleIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function ShieldExclamationIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016zM12 9v2m0 4h.01"
      />
    </svg>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ item }: { item: KpiItem }) {
  return (
    <article
      aria-label={item.description ?? item.label}
      className="flex items-start gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className={`rounded-lg p-2 ${item.color}`}>{item.icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-neutral-500">{item.label}</p>
        <p className="mt-0.5 truncate text-2xl font-semibold tracking-tight text-neutral-900">
          {item.value}
        </p>
        {item.sub && <p className="mt-0.5 text-xs text-neutral-400">{item.sub}</p>}
      </div>
    </article>
  );
}

function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}

// ── KPI Row ───────────────────────────────────────────────────────────────────

interface KpiRowProps {
  data?: PaymentAnalyticsData | undefined;
  isLoading?: boolean | undefined;
}

export function KpiRow({ data, isLoading }: KpiRowProps) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const fmt = (val: string) =>
    `$${parseFloat(val || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const items: KpiItem[] = [
    {
      label: 'Total Collected',
      value: fmt(data.totalCollected ?? data.totalRevenue?.usdEquivalent ?? '0'),
      sub: `${data.transactionCount?.confirmed ?? 0} confirmed txns`,
      color: 'bg-emerald-50 text-emerald-600',
      icon: <CheckCircleIcon />,
      description: 'Total revenue collected from confirmed payments',
    },
    {
      label: 'Outstanding',
      value: fmt(data.totalOutstanding ?? '0'),
      sub: `${data.transactionCount?.pending ?? 0} pending txns`,
      color: 'bg-amber-50 text-amber-600',
      icon: <ClockIcon />,
      description: 'Total amount from payments that are still pending',
    },
    {
      label: 'Refunded',
      value: fmt(data.totalRefunded ?? '0'),
      sub: 'Processed refunds',
      color: 'bg-sky-50 text-sky-600',
      icon: <RefreshIcon />,
      description: 'Total amount that has been refunded to patients',
    },
    {
      label: 'Disputed',
      value: fmt(data.totalDisputed ?? '0'),
      sub: 'Open disputes',
      color: 'bg-rose-50 text-rose-600',
      icon: <ShieldExclamationIcon />,
      description: 'Total amount under dispute review',
    },
  ];

  return (
    <section aria-label="Key Performance Indicators">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <KpiCard key={item.label} item={item} />
        ))}
      </div>
    </section>
  );
}
