'use client';

import { useQueries } from '@tanstack/react-query';
import Link from 'next/link';
import { PageWrapper, PageHeader, Button } from '@/components/ui';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentTable } from '@/components/dashboard/RecentTable';

import { API_BASE } from '@/lib/api';

const API = API_BASE;

async function fetchDashboard() {
  const res = await fetch(`${API}/dashboard`);
  if (!res.ok) throw new Error('Failed to load dashboard');
  const json = await res.json();
  return json.data;
}

export default function DashboardPage() {
  const [{ data, isLoading, isError }] = useQueries({
    queries: [{ queryKey: ['dashboard'], queryFn: fetchDashboard }],
  });

  const stats = data?.stats;
  const recentPatients: Record<string, unknown>[] = data?.recentPatients ?? [];
  const todayEncounters: Record<string, unknown>[] = data?.todayEncounters ?? [];
  const pendingPayments: Record<string, unknown>[] = data?.pendingPayments ?? [];

  return (
    <PageWrapper className="py-8 space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle={`Today — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button asChild variant="primary" size="sm">
              <Link href="/patients?new=1">+ New Patient</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/encounters?new=1">+ Log Encounter</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/payments?new=1">+ Payment Intent</Link>
            </Button>
          </div>
        }
      />

      {/* Stats row */}
      {isError ? (
        <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700">
          Could not load dashboard data. Make sure the API is running.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            title="Today's Patients"
            value={isLoading ? '…' : (stats?.todayPatients ?? 0)}
            icon="🧑‍⚕️"
            color="blue"
          />
          <StatCard
            title="Today's Encounters"
            value={isLoading ? '…' : (stats?.todayEncounters ?? 0)}
            icon="📋"
            color="green"
          />
          <StatCard
            title="Pending Payments"
            value={isLoading ? '…' : (stats?.pendingPayments ?? 0)}
            icon="💳"
            color="yellow"
          />
          <StatCard
            title="Active Doctors"
            value={isLoading ? '…' : (stats?.activeDoctors ?? 0)}
            icon="👨‍⚕️"
            color="indigo"
          />
        </div>
      )}

      {/* Recent tables */}
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
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
          ]}
          rows={pendingPayments}
        />
      </div>
    </PageWrapper>
  );
}
