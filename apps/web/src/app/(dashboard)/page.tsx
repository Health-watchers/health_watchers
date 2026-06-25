'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PageWrapper, PageHeader, CardSkeleton, Badge } from '@/components/ui';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentTable } from '@/components/dashboard/RecentTable';
import { AppointmentsSummary } from '@/components/dashboard/AppointmentsSummary';
import { PaymentStatusOverview } from '@/components/dashboard/PaymentStatusOverview';
import { PatientMetrics } from '@/components/dashboard/PatientMetrics';
import { fetchWithAuth } from '@/lib/auth';
import { API_URL } from '@/lib/api';

const API = `${API_URL}/api/v1`;

const REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30s', value: 30_000 },
  { label: '1m', value: 60_000 },
  { label: '5m', value: 300_000 },
] as const;

interface UpcomingAppointment {
  _id: string;
  scheduledAt: string;
  type: string;
  status: string;
  patientId?: { firstName?: string; lastName?: string } | null;
}

interface PaymentRecord {
  _id: string;
  intentId: string;
  amount: string;
  assetCode: string;
  confirmedAt?: string;
  txHash?: string;
}

interface DashboardData {
  stats: {
    todayPatients: number;
    todayEncounters: number;
    pendingPayments: number;
    activeDoctors: number;
  };
  recentPatients: Record<string, unknown>[];
  todayEncounters: Record<string, unknown>[];
  pendingPayments: Record<string, unknown>[];
  appointments: {
    todayTotal: number;
    scheduled: number;
    confirmed: number;
    cancelled: number;
    completed: number;
    upcoming: UpcomingAppointment[];
  };
  paymentStatus: {
    pending: number;
    confirmed: number;
    failed: number;
    recentConfirmed: PaymentRecord[];
  };
  patientMetrics: {
    total: number;
    active: number;
    inactive: number;
    byRisk: { low: number; medium: number; high: number; critical: number };
  };
}

interface HighRiskPatient {
  _id: string;
  firstName: string;
  lastName: string;
  riskScore: number;
  riskLevel: 'high' | 'critical';
  riskFactors: string[];
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetchWithAuth(`${API}/dashboard`);
  if (!res.ok) throw new Error('Failed to load dashboard');
  const json = await res.json();
  return json.data;
}

async function fetchHighRiskPatients(): Promise<HighRiskPatient[]> {
  const res = await fetchWithAuth(`${API}/patients?riskLevel=high,critical&limit=10`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data ?? []).filter(
    (p: HighRiskPatient) => p.riskLevel === 'high' || p.riskLevel === 'critical'
  );
}

function KpiSkeletons() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy="true" aria-label="Loading KPI cards">
      {Array.from({ length: 4 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

function WidgetSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-1 gap-6 lg:grid-cols-${count}`} aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [refreshInterval, setRefreshInterval] = useState<number>(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const onSuccess = useCallback(() => setLastRefreshed(new Date()), []);

  const { data, isLoading, isError, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    staleTime: 30_000,
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
    notifyOnChangeProps: 'all',
  });

  const { data: highRiskPatients = [] } = useQuery<HighRiskPatient[]>({
    queryKey: ['high-risk-patients'],
    queryFn: fetchHighRiskPatients,
    staleTime: 60_000,
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
  });

  // Keep lastRefreshed in sync with data changes
  const stats = data?.stats;
  const recentPatients = data?.recentPatients ?? [];
  const todayEncounters = data?.todayEncounters ?? [];
  const pendingPayments = data?.pendingPayments ?? [];

  return (
    <PageWrapper className="space-y-8 py-8">
      <PageHeader
        title="Dashboard"
        subtitle={`Today — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Refresh controls */}
            <div className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900">
              <span className="text-xs text-neutral-500" aria-hidden="true">⟳</span>
              <label htmlFor="refresh-rate" className="sr-only">Auto-refresh interval</label>
              <select
                id="refresh-rate"
                className="bg-transparent text-xs text-neutral-700 focus:outline-none dark:text-neutral-200"
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                aria-label="Set auto-refresh interval"
              >
                {REFRESH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => { void refetch(); setLastRefreshed(new Date()); }}
                className="ml-1 rounded p-0.5 text-xs text-neutral-500 hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                aria-label="Refresh now"
                title="Refresh now"
              >
                Refresh
              </button>
            </div>
            {data && (
              <span className="text-xs text-neutral-400" aria-live="polite">
                Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {/* Quick actions */}
            <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
              <Link
                href="/patients/new"
                className="focus-visible:ring-primary-500 bg-primary-500 hover:bg-primary-600 active:bg-primary-700 inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-label="Register a new patient"
              >
                + New Patient
              </Link>
              <Link
                href="/encounters"
                className="focus-visible:ring-primary-500 inline-flex h-8 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:bg-neutral-100"
                aria-label="Log a new encounter"
              >
                + Log Encounter
              </Link>
              <Link
                href="/payments"
                className="focus-visible:ring-primary-500 inline-flex h-8 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:bg-neutral-100"
                aria-label="Initiate a payment"
              >
                + Payment Intent
              </Link>
            </nav>
          </div>
        }
      />

      {/* KPI Cards */}
      {isError ? (
        <div role="alert" className="border-danger-100 bg-danger-50 text-danger-700 rounded-lg border p-4 text-sm">
          Could not load dashboard data. Make sure the API is running.
        </div>
      ) : isLoading ? (
        <KpiSkeletons />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard title="Total Active Patients" value={stats?.todayPatients ?? 0} icon="🧑‍⚕️" color="blue" label="Total active patients in the clinic" />
          <StatCard title="Today's Encounters" value={stats?.todayEncounters ?? 0} icon="📋" color="green" label="Encounters logged today" />
          <StatCard title="Pending Payments" value={stats?.pendingPayments ?? 0} icon="💳" color="yellow" label="Payments awaiting confirmation" />
          <StatCard title="Active Doctors" value={stats?.activeDoctors ?? 0} icon="👨‍⚕️" color="indigo" label="Active doctors in the clinic" />
        </div>
      )}

      {/* New widgets row */}
      {isLoading ? (
        <WidgetSkeletons count={3} />
      ) : data ? (
        <section aria-label="Detailed metrics" className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <AppointmentsSummary data={data.appointments} />
          <PaymentStatusOverview data={data.paymentStatus} />
          <PatientMetrics data={data.patientMetrics} />
        </section>
      ) : null}

      {/* High-Risk Patients */}
      {highRiskPatients.length > 0 && (
        <section aria-label="High-risk patients">
          <div className="rounded-lg border border-danger-200 bg-danger-50 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-danger-700">
              <span aria-hidden="true">⚠️</span> High-Risk Patients ({highRiskPatients.length})
            </h2>
            <div className="space-y-2">
              {highRiskPatients.map((p) => (
                <Link
                  key={p._id}
                  href={`/patients/${p._id}?tab=risk`}
                  className="flex items-center justify-between rounded bg-white px-3 py-2 text-sm transition-colors hover:bg-danger-50"
                >
                  <span className="font-medium text-gray-900">{p.firstName} {p.lastName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{p.riskFactors?.slice(0, 2).join(', ')}</span>
                    <Badge variant="danger">{p.riskLevel} · {p.riskScore}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recent Activity Feed */}
      <section aria-label="Recent activity">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <RecentTable
            title="Recent Patients"
            emptyMessage="No patients registered yet"
            columns={[
              { key: 'firstName', label: 'First Name' },
              { key: 'lastName', label: 'Last Name' },
              {
                key: 'createdAt',
                label: 'Registered',
                render: (row) =>
                  row.createdAt ? new Date(row.createdAt as string).toLocaleDateString() : '—',
              },
            ]}
            rows={recentPatients}
          />
          <RecentTable
            title="Today's Encounters"
            emptyMessage="No encounters logged today"
            columns={[
              { key: 'chiefComplaint', label: 'Chief Complaint' },
              { key: 'status', label: 'Status' },
              {
                key: 'createdAt',
                label: 'Time',
                render: (row) =>
                  row.createdAt
                    ? new Date(row.createdAt as string).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—',
              },
            ]}
            rows={todayEncounters}
          />
          <RecentTable
            title="Pending Payments"
            emptyMessage="No pending payments"
            columns={[
              {
                key: 'intentId',
                label: 'Intent ID',
                render: (row) => String(row.intentId ?? '').slice(0, 8) + '…',
              },
              { key: 'amount', label: 'Amount (XLM)' },
              {
                key: 'txHash',
                label: 'Tx Hash',
                render: (row) =>
                  row.txHash ? (
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${row.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline focus:underline focus:outline-none"
                      aria-label={`View transaction ${String(row.txHash).slice(0, 8)} on Stellar Explorer`}
                    >
                      {String(row.txHash).slice(0, 8)}…
                    </a>
                  ) : (
                    '—'
                  ),
              },
            ]}
            rows={pendingPayments}
          />
        </div>
      </section>
    </PageWrapper>
  );
}
