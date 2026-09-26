'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations, useFormatter } from 'next-intl';
import Link from 'next/link';
import { PageWrapper, PageHeader, CardSkeleton, Badge } from '@/components/ui';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentTable } from '@/components/dashboard/RecentTable';
import { AppointmentWidget } from '@/components/dashboard/AppointmentWidget';
import { QuickActionsWidget } from '@/components/dashboard/QuickActionsWidget';
import { fetchWithAuth } from '@/lib/auth';
import { API_URL } from '@/lib/api';

const API = `${API_URL}/api/v1`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  stats: {
    totalPatients: number;
    newPatientsToday: number;
    todayEncounters: number;
    pendingPayments: number;
    activeDoctors: number;
    appointmentsToday: number;
  };
  patientPopulation: { total: number; newToday: number; highRisk: number };
  paymentStatus: { pending: number; confirmedToday: number; failedToday: number };
  upcomingAppointments: Array<{
    _id: string;
    scheduledAt: string;
    type: string;
    status: string;
    chiefComplaint?: string;
    isTelemedicine?: boolean;
    patientId?: { firstName?: string; lastName?: string };
  }>;
  recentPatients: Record<string, unknown>[];
  todayEncounters: Record<string, unknown>[];
  pendingPayments: Record<string, unknown>[];
}

interface HighRiskPatient {
  _id: string;
  firstName: string;
  lastName: string;
  riskScore: number;
  riskLevel: 'high' | 'critical';
  riskFactors: string[];
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetchWithAuth(`${API}/dashboard`);
  if (!res.ok) throw new Error('Failed to load dashboard');
  return (await res.json()).data;
}

async function fetchHighRiskPatients(): Promise<HighRiskPatient[]> {
  const res = await fetchWithAuth(`${API}/patients?riskLevel=high,critical&limit=10`);
  if (!res.ok) return [];
  return ((await res.json()).data ?? []).filter(
    (p: any) => p.riskLevel === 'high' || p.riskLevel === 'critical'
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const REFRESH_OPTIONS = [0, 30_000, 60_000, 300_000];

function KpiSkeletons() {
  const t = useTranslations('dashboard');
  return (
    <div
      className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      aria-busy="true"
      aria-label={t('loadingKpis')}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

function PaymentStatusWidget({ data }: { data: DashboardData['paymentStatus'] }) {
  const t = useTranslations('dashboard.paymentStatus');
  const total = data.pending + data.confirmedToday + data.failedToday || 1;
  return (
    <section
      aria-label={t('aria')}
      className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
    >
      <h2 className="mb-4 text-sm font-semibold text-neutral-700">{t('title')}</h2>
      <div className="space-y-3">
        {[
          { label: t('pending'), count: data.pending, color: 'bg-yellow-400' },
          { label: t('confirmed'), count: data.confirmedToday, color: 'bg-green-500' },
          { label: t('failed'), count: data.failedToday, color: 'bg-red-500' },
        ].map(({ label, count, color }) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-xs text-neutral-600">
              <span>{label}</span>
              <span className="font-medium">{count}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className={`h-2 rounded-full ${color} transition-all duration-500`}
                style={{ width: `${(count / total) * 100}%` }}
                role="progressbar"
                aria-label={`${label}: ${count}`}
                aria-valuenow={count}
                aria-valuemax={total}
              />
            </div>
          </div>
        ))}
      </div>
      <Link
        href="/payments"
        className="mt-4 block text-center text-xs text-indigo-600 hover:underline"
      >
        {t('viewAll')}
      </Link>
    </section>
  );
}

function PopulationWidget({ data }: { data: DashboardData['patientPopulation'] }) {
  const t = useTranslations('dashboard.population');
  return (
    <section
      aria-label={t('aria')}
      className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
    >
      <h2 className="mb-4 text-sm font-semibold text-neutral-700">{t('title')}</h2>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: t('total'), value: data.total, color: 'text-indigo-600' },
          { label: t('newToday'), value: data.newToday, color: 'text-green-600' },
          { label: t('highRisk'), value: data.highRisk, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg bg-neutral-50 px-2 py-3">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </div>
      <Link
        href="/patients"
        className="mt-4 block text-center text-xs text-indigo-600 hover:underline"
      >
        {t('viewAll')}
      </Link>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tStatus = useTranslations('status');
  const format = useFormatter();
  const [refreshInterval, setRefreshInterval] = useState(30_000);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const { data, isLoading, isError, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    staleTime: refreshInterval || 30_000,
    refetchInterval: refreshInterval || false,
  });

  const { data: highRiskPatients = [] } = useQuery<HighRiskPatient[]>({
    queryKey: ['high-risk-patients'],
    queryFn: fetchHighRiskPatients,
    staleTime: 60_000,
    refetchInterval: refreshInterval ? refreshInterval * 2 : false,
  });

  // Track last refresh time
  useEffect(() => {
    if (data) setLastRefreshed(new Date());
  }, [data]);

  const handleManualRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const stats = data?.stats;

  return (
    <PageWrapper className="space-y-6 py-8">
      <PageHeader
        title={t('title')}
        subtitle={t('todaySubtitle', {
          date: format.dateTime(new Date(), {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Refresh rate control */}
            <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1">
              <span className="text-xs text-neutral-500">{t('refreshLabel')}</span>
              {REFRESH_OPTIONS.map((value) => (
                <button
                  key={value}
                  onClick={() => setRefreshInterval(value)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${refreshInterval === value ? 'bg-indigo-600 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
                  aria-pressed={refreshInterval === value}
                >
                  {value === 0
                    ? t('refreshOff')
                    : value < 60_000
                      ? t('refreshSeconds', { count: value / 1000 })
                      : t('refreshMinutes', { count: value / 60_000 })}
                </button>
              ))}
            </div>
            {/* Manual refresh */}
            <button
              onClick={handleManualRefresh}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
              title={t('lastRefreshed', {
                time: format.dateTime(lastRefreshed, { timeStyle: 'medium' }),
              })}
              aria-label={t('refreshAria')}
            >
              {t('refresh')}
            </button>
            <nav aria-label={t('quickActions.title')} className="flex flex-wrap gap-2">
              <Link
                href="/patients/new"
                className="focus-visible:ring-primary-500 bg-primary-500 hover:bg-primary-600 active:bg-primary-700 inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-label={t('newPatientAria')}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-primary-500 px-3 text-xs font-medium text-white transition-colors hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 active:bg-primary-700"
                aria-label="Register a new patient"
              >
                {t('newPatient')}
              </Link>
              <Link
                href="/encounters"
                className="focus-visible:ring-primary-500 inline-flex h-8 items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-label={t('logEncounterAria')}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                aria-label="Log a new encounter"
              >
                {t('logEncounter')}
              </Link>
              <Link
                href="/payments"
                className="focus-visible:ring-primary-500 inline-flex h-8 items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-label={t('paymentAria')}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                aria-label="Initiate a payment"
              >
                {t('payment')}
              </Link>
            </nav>
          </div>
        }
      />

      {/* KPI Cards */}
      {isError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {t('apiError')}
        </div>
      ) : isLoading ? (
        <KpiSkeletons />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            title={t('totalPatients')}
            value={format.number(stats?.totalPatients ?? 0)}
            icon="🧑‍⚕️"
            color="blue"
            label={t('totalPatientsAria')}
          />
          <StatCard
            title={t('todayEncounters')}
            value={format.number(stats?.todayEncounters ?? 0)}
            icon="📋"
            color="green"
            label={t('todayEncountersAria')}
          />
          <StatCard
            title={t('pendingPayments')}
            value={format.number(stats?.pendingPayments ?? 0)}
            icon="💳"
            color="yellow"
            label={t('pendingPaymentsAria')}
          />
          <StatCard
            title={t('todayAppointments')}
            value={format.number(stats?.appointmentsToday ?? 0)}
            icon="📅"
            color="indigo"
            label={t('todayAppointmentsAria')}
          />
        </div>
      )}

      {/* Population + Payment widgets */}
      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PopulationWidget data={data.patientPopulation} />
          <PaymentStatusWidget data={data.paymentStatus} />
        </div>
      )}

      {/* Quick Actions */}
      <QuickActionsWidget />

      {/* Upcoming Appointments */}
      {data && <AppointmentWidget appointments={data.upcomingAppointments} />}

      {/* High-Risk Patients */}
      {highRiskPatients.length > 0 && (
        <section aria-label={t('highRisk.aria')}>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-700">
              <span aria-hidden="true">⚠️</span>{' '}
              {t('highRisk.title', { count: highRiskPatients.length })}
            </h2>
            <div className="space-y-2">
              {highRiskPatients.map((p) => (
                <Link
                  key={p._id}
                  href={`/patients/${p._id}?tab=risk`}
                  className="flex items-center justify-between rounded bg-white px-3 py-2 text-sm transition-colors hover:bg-red-50"
                >
                  <span className="font-medium text-gray-900">
                    {p.firstName} {p.lastName}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {p.riskFactors?.slice(0, 2).join(', ')}
                    </span>
                    <Badge variant="danger">
                      {tStatus(p.riskLevel)} · {p.riskScore}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recent Activity */}
      {data && (
        <section aria-label={t('recentActivity')}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <RecentTable
              title={t('recentPatients')}
              emptyMessage={t('noPatientsYet')}
              columns={[
                { key: 'firstName', label: t('firstName') },
                { key: 'lastName', label: t('lastName') },
                {
                  key: 'createdAt',
                  label: t('registered'),
                  render: (row) =>
                    row.createdAt
                      ? format.dateTime(new Date(row.createdAt as string), { dateStyle: 'medium' })
                      : '—',
                },
              ]}
              rows={data.recentPatients}
            />
            <RecentTable
              title={t('todayEncountersTable')}
              emptyMessage={t('noEncountersToday')}
              columns={[
                { key: 'chiefComplaint', label: t('chiefComplaint') },
                {
                  key: 'status',
                  label: t('status'),
                  render: (row) =>
                    row.status && tStatus.has(String(row.status))
                      ? tStatus(String(row.status))
                      : String(row.status ?? '—'),
                },
                {
                  key: 'createdAt',
                  label: t('time'),
                  render: (row) =>
                    row.createdAt
                      ? format.dateTime(new Date(row.createdAt as string), {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—',
                },
              ]}
              rows={data.todayEncounters}
            />
            <RecentTable
              title={t('pendingPaymentsTable')}
              emptyMessage={t('noPendingPayments')}
              columns={[
                {
                  key: 'intentId',
                  label: t('intentId'),
                  render: (row) => String(row.intentId ?? '').slice(0, 8) + '…',
                },
                {
                  key: 'amount',
                  label: t('amountXlm'),
                  render: (row) =>
                    row.amount != null
                      ? format.number(Number(row.amount), { maximumFractionDigits: 7 })
                      : '—',
                },
                {
                  key: 'txHash',
                  label: t('txHash'),
                  render: (row) =>
                    row.txHash ? (
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${row.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline"
                        aria-label={t('viewTransaction')}
                      >
                        {String(row.txHash).slice(0, 8)}…
                      </a>
                    ) : (
                      '—'
                    ),
                },
              ]}
              rows={data.pendingPayments}
            />
          </div>
        </section>
      )}
    </PageWrapper>
  );
}
