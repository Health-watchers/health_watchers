'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  ErrorMessage,
  Modal,
  PageHeader,
  PageWrapper,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toast,
} from '@/components/ui';
import { BreachIncidentBoard, useNow } from '@/components/compliance/BreachIncidentBoard';
import { BreachIncidentForm } from '@/components/compliance/BreachIncidentForm';
import { BAARegistry } from '@/components/compliance/BAARegistry';
import { ApiError, apiV1Fetch } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import {
  STATUS_LABELS,
  baaExpiry,
  notificationCountdown,
  type BAA,
  type BreachIncident,
  type BreachIncidentInput,
  type NotificationStatus,
} from '@/lib/compliance';

async function fetchIncidents(): Promise<BreachIncident[]> {
  const res = await apiV1Fetch('/admin/breach-incidents');
  return res.data ?? [];
}

async function fetchBaas(): Promise<BAA[]> {
  const res = await apiV1Fetch('/compliance/baas');
  return Array.isArray(res) ? res : (res.data ?? []);
}

type Tone = 'danger' | 'warning' | 'success' | 'default';

const TONE_CLASSES: Record<Tone, string> = {
  danger:
    'border-danger-200 bg-danger-50 text-danger-700 dark:border-danger-800 dark:bg-danger-900/20',
  warning:
    'border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-800 dark:bg-warning-900/20',
  success:
    'border-success-200 bg-success-50 text-success-700 dark:border-success-800 dark:bg-success-900/20',
  default:
    'border-neutral-200 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100',
};

function KpiTile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  tone: Tone;
  hint?: string;
}) {
  return (
    <div className={['rounded-lg border p-4', TONE_CLASSES[tone]].join(' ')}>
      <p className="text-xs font-medium tracking-wide uppercase opacity-80">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs opacity-80">{hint}</p>}
    </div>
  );
}

export default function ComplianceCenterClient() {
  const queryClient = useQueryClient();
  const now = useNow();
  const [tab, setTab] = useState('incidents');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BreachIncident | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const incidentsQuery = useQuery({
    queryKey: queryKeys.compliance.breachIncidents(),
    queryFn: fetchIncidents,
    retry: (count, err) => !(err instanceof ApiError && err.status === 403) && count < 2,
  });
  const baasQuery = useQuery({ queryKey: queryKeys.compliance.baas(), queryFn: fetchBaas });

  const incidents = incidentsQuery.data ?? [];
  const baas = baasQuery.data ?? [];
  const incidentsForbidden =
    incidentsQuery.error instanceof ApiError && incidentsQuery.error.status === 403;

  const setIncident = (updated: BreachIncident) =>
    queryClient.setQueryData<BreachIncident[]>(queryKeys.compliance.breachIncidents(), (prev) =>
      prev?.some((i) => i._id === updated._id)
        ? prev.map((i) => (i._id === updated._id ? updated : i))
        : [updated, ...(prev ?? [])]
    );

  const saveIncident = useMutation({
    mutationFn: (payload: BreachIncidentInput) =>
      apiV1Fetch(editing ? `/admin/breach-incidents/${editing._id}` : '/admin/breach-incidents', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      setIncident(res.data);
      setFormOpen(false);
      setToast({ message: editing ? 'Incident updated' : 'Incident reported', type: 'success' });
    },
    onError: (err: Error) => setToast({ message: err.message, type: 'error' }),
  });

  const transition = useMutation({
    mutationFn: ({ incident, next }: { incident: BreachIncident; next: NotificationStatus }) =>
      apiV1Fetch(`/admin/breach-incidents/${incident._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ notificationStatus: next }),
      }),
    onSuccess: (res, { next }) => {
      setIncident(res.data);
      setToast({ message: `Moved to ${STATUS_LABELS[next]}`, type: 'success' });
    },
    onError: (err: Error) => {
      setToast({ message: err.message, type: 'error' });
      queryClient.invalidateQueries({ queryKey: queryKeys.compliance.breachIncidents() });
    },
  });

  // ── KPIs ────────────────────────────────────────────────────────────────
  const open = incidents.filter((i) => i.notificationStatus !== 'COMPLETE');
  const overdue = open.filter(
    (i) => notificationCountdown(i.notificationDeadline, i.notificationStatus, now).overdue
  );
  const dueSoon = open.filter((i) => {
    const c = notificationCountdown(i.notificationDeadline, i.notificationStatus, now);
    return !c.overdue && c.days < 7;
  });
  const expiring = baas.filter((b) => baaExpiry(b, now).state === 'expiring');
  const expired = baas.filter((b) => baaExpiry(b, now).state === 'expired');
  const missingDocs = baas.filter((b) => !b.documentUrl);

  const openForm = (incident: BreachIncident | null) => {
    setEditing(incident);
    setFormOpen(true);
  };

  return (
    <PageWrapper className="space-y-6 py-6">
      <PageHeader
        title="Compliance Center"
        subtitle="HIPAA breach notifications and business associate agreements"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/compliance/audit-logs"
              className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Audit logs
            </Link>
            {!incidentsForbidden && <Button onClick={() => openForm(null)}>Report incident</Button>}
          </div>
        }
      />

      <section
        aria-label="Compliance KPIs"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        {incidentsQuery.isLoading || baasQuery.isLoading ? (
          Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <KpiTile
              label="Open incidents"
              value={incidentsForbidden ? '—' : open.length}
              tone={open.length ? 'warning' : 'default'}
            />
            <KpiTile
              label="Overdue notices"
              value={incidentsForbidden ? '—' : overdue.length}
              tone={overdue.length ? 'danger' : 'success'}
              hint="Past 60-day deadline"
            />
            <KpiTile
              label="Due in 7 days"
              value={incidentsForbidden ? '—' : dueSoon.length}
              tone={dueSoon.length ? 'warning' : 'default'}
            />
            <KpiTile label="BAAs on file" value={baas.length} tone="default" />
            <KpiTile
              label="Expiring ≤ 30 days"
              value={expiring.length}
              tone={expiring.length ? 'warning' : 'success'}
            />
            <KpiTile
              label="Expired / no document"
              value={expired.length + missingDocs.filter((b) => !expired.includes(b)).length}
              tone={expired.length ? 'danger' : missingDocs.length ? 'warning' : 'success'}
            />
          </>
        )}
      </section>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="incidents">Breach incidents</TabsTrigger>
          <TabsTrigger value="baas">BAA registry</TabsTrigger>
        </TabsList>

        <TabsContent value="incidents" className="pt-4">
          {incidentsForbidden ? (
            <p className="rounded-lg border border-neutral-200 p-6 text-sm text-neutral-500 dark:border-neutral-700">
              Breach incident management is restricted to Super Admins.
            </p>
          ) : incidentsQuery.isLoading ? (
            <Skeleton className="h-64" />
          ) : incidentsQuery.error ? (
            <ErrorMessage
              message={(incidentsQuery.error as Error).message}
              onRetry={() => incidentsQuery.refetch()}
            />
          ) : (
            <BreachIncidentBoard
              incidents={incidents}
              pendingId={transition.isPending ? transition.variables?.incident._id : null}
              onTransition={(incident, next) => transition.mutate({ incident, next })}
              onEdit={openForm}
            />
          )}
        </TabsContent>

        <TabsContent value="baas" className="pt-4">
          {baasQuery.isLoading ? (
            <Skeleton className="h-64" />
          ) : baasQuery.error ? (
            <ErrorMessage
              message={(baasQuery.error as Error).message}
              onRetry={() => baasQuery.refetch()}
            />
          ) : (
            <BAARegistry baas={baas} now={now} />
          )}
        </TabsContent>
      </Tabs>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit breach incident' : 'Report breach incident'}
        size="lg"
      >
        <BreachIncidentForm
          key={editing?._id ?? 'new'}
          incident={editing}
          submitting={saveIncident.isPending}
          onSubmit={(payload) => saveIncident.mutate(payload)}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </PageWrapper>
  );
}
