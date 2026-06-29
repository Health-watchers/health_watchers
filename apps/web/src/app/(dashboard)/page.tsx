'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PageWrapper, PageHeader, CardSkeleton, Badge } from '@/components/ui';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentTable } from '@/components/dashboard/RecentTable';
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

const REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30s', value: 30_000 },
  { label: '1m', value: 60_000 },
  { label: '5m', value: 300_000 },
];

const statusBadge: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  scheduled: 'bg-blue-100 text-blue-800',
  patient_arrived: 'bg-indigo-100 text-indigo-800',
  cancelled: 'bg-neutral-100 text-neutral-500',
  completed: 'bg-green-100 text-green-700',
};

function KpiSkeletons() {
  return (
    <div
      className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      aria-busy="true"
      aria-label="Loading KPI cards"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

function PaymentStatusWidget({ data }: { data: DashboardData['paymentStatus'] }) {
  const total = data.pending + data.confirmedToday + data.failedToday || 1;
  return (
    <section
      aria-label="Payment status overview"
      className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
    >
      <h2 className="mb-4 text-sm font-semibold text-neutral-700">Payment Status (Today)</h2>
      <div className="space-y-3">
        {[
          { label: 'Pending', count: data.pending, color: 'bg-yellow-400' },
          { label: 'Confirmed', count: data.confirmedToday, color: 'bg-green-500' },
          { label: 'Failed', count: data.failedToday, color: 'bg-red-500' },
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
        View all payments →
      </Link>
    </section>
  );
}

function PopulationWidget({ data }: { data: DashboardData['patientPopulation'] }) {
  return (
    <section
      aria-label="Patient population metrics"
      className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
    >
      <h2 className="mb-4 text-sm font-semibold text-neutral-700">Patient Population</h2>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Total', value: data.total, color: 'text-indigo-600' },
          { label: 'New today', value: data.newToday, color: 'text-green-600' },
          { label: 'High risk', value: data.highRisk, color: 'text-red-600' },
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
        View all patients →
      </Link>
    </section>
  );
}

function UpcomingAppointmentsWidget({
  appointments,
}: {
  appointments: DashboardData['upcomingAppointments'];
}) {
  return (
    <section
      aria-label="Upcoming appointments"
      className="rounded-xl border border-neutral-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-neutral-700">Upcoming Appointments (7 days)</h2>
        <Link href="/appointments" className="text-xs text-indigo-600 hover:underline">
          View all
        </Link>
      </div>
      {appointments.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">No upcoming appointments</p>
      ) : (
        <ul className="divide-y divide-neutral-100" role="list">
          {appointments.map((apt) => {
            const patient = apt.patientId;
            const name = patient
              ? `${patient.firstName ?? ''} ${patient.lastName ?? ''}`.trim()
              : 'Unknown patient';
            const time = new Date(apt.scheduledAt);
            return (
              <li key={apt._id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-[90px] text-xs text-neutral-500">
                  <div className="font-medium text-neutral-800">
                    {time.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                  <div>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div className="flex-1 truncate">
                  <p className="truncate font-medium text-neutral-800">{name}</p>
                  <p className="truncate text-xs text-neutral-500 capitalize">
                    {apt.type}
                    {apt.chiefComplaint ? ` — ${apt.chiefComplaint}` : ''}
                    {apt.isTelemedicine ? ' 🎥' : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[apt.status] ?? 'bg-neutral-100 text-neutral-600'}`}
                >
                  {apt.status}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardPage() {
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
        title="Dashboard"
        subtitle={`Today — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Refresh rate control */}
            <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1">
              <span className="text-xs text-neutral-500">Refresh:</span>
              {REFRESH_OPTIONS.map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => setRefreshInterval(value)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${refreshInterval === value ? 'bg-indigo-600 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
                  aria-pressed={refreshInterval === value}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Manual refresh */}
            <button
              onClick={handleManualRefresh}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
              title={`Last refreshed: ${lastRefreshed.toLocaleTimeString()}`}
              aria-label="Refresh dashboard data"
            >
              ↻ Refresh
            </button>
            <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
              <Link
                href="/patients/new"
                className="focus-visible:ring-primary-500 bg-primary-500 hover:bg-primary-600 active:bg-primary-700 inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-label="Register a new patient"
              >
                + New Patient
              </Link>
              <Link
                href="/encounters"
                className="focus-visible:ring-primary-500 inline-flex h-8 items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-label="Log a new encounter"
              >
                + Log Encounter
              </Link>
              <Link
                href="/payments"
                className="focus-visible:ring-primary-500 inline-flex h-8 items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-label="Initiate a payment"
              >
                + Payment
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
          Could not load dashboard data. Make sure the API is running.
        </div>
      ) : isLoading ? (
        <KpiSkeletons />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            title="Total Patients"
            value={stats?.totalPatients ?? 0}
            icon="🧑‍⚕️"
            color="blue"
            label="Total patients in the clinic"
          />
          <StatCard
            title="Today's Encounters"
            value={stats?.todayEncounters ?? 0}
            icon="📋"
            color="green"
            label="Encounters logged today"
          />
          <StatCard
            title="Pending Payments"
            value={stats?.pendingPayments ?? 0}
            icon="💳"
            color="yellow"
            label="Payments awaiting confirmation"
          />
          <StatCard
            title="Today's Appointments"
            value={stats?.appointmentsToday ?? 0}
            icon="📅"
            color="indigo"
            label="Appointments scheduled today"
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

      {/* Upcoming Appointments */}
      {data && <UpcomingAppointmentsWidget appointments={data.upcomingAppointments} />}

      {/* High-Risk Patients */}
      {highRiskPatients.length > 0 && (
        <section aria-label="High-risk patients">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-700">
              <span aria-hidden="true">⚠️</span> High-Risk Patients ({highRiskPatients.length})
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
                      {p.riskLevel} · {p.riskScore}
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
              rows={data.recentPatients}
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
              rows={data.todayEncounters}
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
                        className="text-indigo-600 hover:underline"
                        aria-label={`View transaction on Stellar Explorer`}
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
