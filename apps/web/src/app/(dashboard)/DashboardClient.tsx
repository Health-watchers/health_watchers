'use client';

import { useQueries } from '@tanstack/react-query';
import Link from 'next/link';
import { PageWrapper, PageHeader, Button } from '@/components/ui';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentTable } from '@/components/dashboard/RecentTable';

const API = 'http://localhost:3001/api/v1';

async function fetchDashboard() {
  const res = await fetch(`${API}/dashboard`);
  if (!res.ok) throw new Error('Failed to load dashboard');
  const json = await res.json();
  return json.data;
}

interface DashboardLabels {
  title: string;
  todayPatients: string;
  todayEncounters: string;
  pendingPayments: string;
  activeDoctors: string;
  recentPatients: string;
  noPatientsYet: string;
  todayEncountersTable: string;
  noEncountersToday: string;
  pendingPaymentsTable: string;
  noPendingPayments: string;
  newPatient: string;
  logEncounter: string;
  paymentIntent: string;
  apiError: string;
  firstName: string;
  lastName: string;
  registered: string;
  chiefComplaint: string;
  time: string;
  intentId: string;
  amount: string;
  status: string;
  loading: string;
}

export default function DashboardClient({ labels }: { labels: DashboardLabels }) {
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
        title={labels.title}
        subtitle={`${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button asChild variant="primary" size="sm">
              <Link href="/patients?new=1">{labels.newPatient}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/encounters?new=1">{labels.logEncounter}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/payments?new=1">{labels.paymentIntent}</Link>
            </Button>
          </div>
        }
      />

      {isError ? (
        <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700">
          {labels.apiError}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            title={labels.todayPatients}
            value={isLoading ? '…' : (stats?.todayPatients ?? 0)}
            icon="🧑‍⚕️"
            color="blue"
          />
          <StatCard
            title={labels.todayEncounters}
            value={isLoading ? '…' : (stats?.todayEncounters ?? 0)}
            icon="📋"
            color="green"
          />
          <StatCard
            title={labels.pendingPayments}
            value={isLoading ? '…' : (stats?.pendingPayments ?? 0)}
            icon="💳"
            color="yellow"
          />
          <StatCard
            title={labels.activeDoctors}
            value={isLoading ? '…' : (stats?.activeDoctors ?? 0)}
            icon="👨‍⚕️"
            color="indigo"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <RecentTable
          title={labels.recentPatients}
          emptyMessage={labels.noPatientsYet}
          columns={[
            { key: 'firstName', label: labels.firstName },
            { key: 'lastName', label: labels.lastName },
            {
              key: 'createdAt',
              label: labels.registered,
              render: (row) =>
                row.createdAt ? new Date(row.createdAt as string).toLocaleDateString() : '—',
            },
          ]}
          rows={recentPatients}
        />

        <RecentTable
          title={labels.todayEncountersTable}
          emptyMessage={labels.noEncountersToday}
          columns={[
            { key: 'chiefComplaint', label: labels.chiefComplaint },
            {
              key: 'createdAt',
              label: labels.time,
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
          title={labels.pendingPaymentsTable}
          emptyMessage={labels.noPendingPayments}
          columns={[
            {
              key: 'intentId',
              label: labels.intentId,
              render: (row) => String(row.intentId ?? '').slice(0, 8) + '…',
            },
            { key: 'amount', label: labels.amount },
            { key: 'status', label: labels.status },
          ]}
          rows={pendingPayments}
        />
      </div>
    </PageWrapper>
  );
}
