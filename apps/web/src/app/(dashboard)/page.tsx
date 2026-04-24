'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PageWrapper, PageHeader, CardSkeleton } from '@/components/ui';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentTable } from '@/components/dashboard/RecentTable';
import { fetchWithAuth } from '@/lib/auth';
import { API_URL } from '@/lib/api';

const API = `${API_URL}/api/v1`;

interface DashboardStats {
  todayPatients: number;
  todayEncounters: number;
  pendingPayments: number;
  activeDoctors: number;
}

interface DashboardData {
  stats: DashboardStats;
  recentPatients: Record<string, unknown>[];
  todayEncounters: Record<string, unknown>[];
  pendingPayments: Record<string, unknown>[];
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetchWithAuth(`${API}/dashboard`);
  if (!res.ok) throw new Error('Failed to load dashboard');
  const json = await res.json();
  return json.data;
}

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

export default function DashboardPage() {
  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    staleTime: 30_000,
  });

  const stats = data?.stats;
  const recentPatients: Record<string, unknown>[] = data?.recentPatients ?? [];
  const todayEncounters: Record<string, unknown>[] = data?.todayEncounters ?? [];
  const pendingPayments: Record<string, unknown>[] = data?.pendingPayments ?? [];

  return (
    <PageWrapper className="space-y-8 py-8">
      <PageHeader
        title="Dashboard"
        subtitle={`Today — ${new Date().toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}`}
        actions={
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
        }
      />

      {/* KPI Cards */}
      {isError ? (
        <div
          role="alert"
          className="border-danger-100 bg-danger-50 text-danger-700 rounded-lg border p-4 text-sm"
        >
          Could not load dashboard data. Make sure the API is running.
        </div>
      ) : isLoading ? (
        <KpiSkeletons />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            title="Total Active Patients"
            value={stats?.todayPatients ?? 0}
            icon="🧑‍⚕️"
            color="blue"
            label="Total active patients in the clinic"
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
            title="Active Doctors"
            value={stats?.activeDoctors ?? 0}
            icon="👨‍⚕️"
            color="indigo"
            label="Active doctors in the clinic"
          />
        </div>
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
              {
                key: 'status',
                label: 'Status',
              },
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
              {
                key: 'amount',
                label: 'Amount (XLM)',
              },
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
