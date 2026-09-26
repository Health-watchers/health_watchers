'use client';

import { useQueries } from '@tanstack/react-query';
import Link from 'next/link';
import { PageWrapper, PageHeader, Button } from '@/components/ui';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentTable } from '@/components/dashboard/RecentTable';
import { HealthScoreCard } from '@/components/dashboard/HealthScoreCard';
import { MedicationList } from '@/components/dashboard/MedicationList';
import { VaccinationStatus } from '@/components/dashboard/VaccinationStatus';
import { AppointmentTimeline } from '@/components/dashboard/AppointmentTimeline';
import { ActionItems } from '@/components/dashboard/ActionItems';

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
    <PageWrapper className="space-y-8 py-8">
      <PageHeader
        title={labels.title}
        subtitle={`${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <div className="flex flex-wrap gap-2">
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
        <div className="border-danger-200 bg-danger-50 text-danger-700 dark:border-danger-900 dark:bg-danger-900/30 dark:text-danger-400 rounded-lg border p-4 text-sm">
          {labels.apiError}
        </div>
      ) : (
        <>
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <HealthScoreCard
                score={isLoading ? 0 : (stats?.healthScore ?? 75)}
                trend="up"
                trendPercent={5}
              />

              <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
                <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                  Upcoming Appointments
                </h3>
                <AppointmentTimeline
                  appointments={
                    (todayEncounters as any[])?.slice(0, 5).map((e, i) => ({
                      id: String(i),
                      type: e.chiefComplaint || 'Appointment',
                      provider: e.provider || 'Healthcare Provider',
                      scheduledAt: e.createdAt,
                      status: 'scheduled',
                    })) || []
                  }
                  loading={isLoading}
                />
              </div>

              <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
                <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                  Recent Lab Results
                </h3>
                <RecentTable
                  title=""
                  emptyMessage="No recent lab results"
                  columns={[
                    { key: 'type', label: 'Test' },
                    { key: 'value', label: 'Result' },
                    { key: 'status', label: 'Status' },
                  ]}
                  rows={(data?.labResults ?? []).slice(0, 3)}
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
                <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                  Active Medications
                </h3>
                <MedicationList
                  medications={
                    (data?.medications ?? []).slice(0, 5).map((m: any, i: number) => ({
                      id: String(i),
                      name: m.name || 'Medication',
                      dosage: m.dosage || 'Unknown',
                      frequency: m.frequency || 'As prescribed',
                      prescribedDate: m.prescribedDate || new Date().toISOString(),
                      hasInteractions: m.hasInteractions || false,
                      interactionWarning: m.interactionWarning,
                    })) || []
                  }
                  loading={isLoading}
                />
              </div>

              <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
                <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                  Vaccination Status
                </h3>
                <VaccinationStatus
                  vaccinations={
                    (data?.vaccinations ?? []).map((v: any, i: number) => ({
                      id: String(i),
                      name: v.name || 'Vaccine',
                      dateAdministered: v.dateAdministered || new Date().toISOString(),
                      nextDueDate: v.nextDueDate,
                      status: v.status || 'completed',
                    })) || []
                  }
                  loading={isLoading}
                />
              </div>

              <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
                <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                  Action Items
                </h3>
                <ActionItems
                  items={
                    (data?.actionItems ?? []).map((a: any, i: number) => ({
                      id: String(i),
                      title: a.title || 'Follow up',
                      description: a.description || '',
                      priority: a.priority || 'medium',
                      dueDate: a.dueDate,
                      completed: a.completed || false,
                    })) || []
                  }
                  loading={isLoading}
                />
              </div>
            </div>
          </div>

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
        </>
      )}
    </PageWrapper>
  );
}
