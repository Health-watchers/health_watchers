'use client';

import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AssetSelector,
  Badge,
  Button,
  ErrorMessage,
  Modal,
  SlideOver,
  Spinner,
  Toast,
} from '@/components/ui';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';
import { webConfig } from '@/lib/config';
import { queryKeys } from '@/lib/queryKeys';
import { getStellarExplorerUrl } from '@/lib/utils';

type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'annually';
type ScheduleStatus = 'active' | 'paused' | 'cancelled' | 'completed';
type RunStatus = 'pending' | 'completed' | 'failed';

interface RecurringRun {
  _id?: string;
  date: string;
  intentId?: string;
  status: RunStatus;
  transactionHash?: string;
  failureReason?: string;
  retryCount?: number;
}

export interface RecurringSchedule {
  _id: string;
  patientId: string;
  amount: string;
  currency: 'XLM' | 'USDC';
  frequency: Frequency;
  startDate: string;
  endDate?: string;
  nextPaymentDate: string;
  status: ScheduleStatus;
  description?: string;
  paymentHistory: RecurringRun[];
  failureCount?: number;
}

const FREQUENCIES: Frequency[] = ['weekly', 'monthly', 'quarterly', 'annually'];

const STATUS_VARIANT: Record<ScheduleStatus, 'success' | 'warning' | 'default' | 'primary'> = {
  active: 'success',
  paused: 'warning',
  cancelled: 'default',
  completed: 'primary',
};

const RUN_VARIANT: Record<RunStatus, 'success' | 'warning' | 'danger'> = {
  completed: 'success',
  pending: 'warning',
  failed: 'danger',
};

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';
}

function lastRun(schedule: RecurringSchedule): RecurringRun | undefined {
  return [...(schedule.paymentHistory ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )[0];
}

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return new Error(body.message ?? `${fallback} (${res.status})`);
}

function TxLink({ hash }: { hash: string }) {
  // Network comes from NEXT_PUBLIC_STELLAR_NETWORK via webConfig — never hard-coded
  return (
    <a
      href={getStellarExplorerUrl(hash, 'tx', webConfig.stellar.network)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs text-primary-600 hover:underline"
      title={hash}
    >
      {hash.slice(0, 8)}…{hash.slice(-6)} ↗
    </a>
  );
}

interface CreateDraft {
  patientId: string;
  amount: string;
  currency: 'XLM' | 'USDC';
  frequency: Frequency;
  startDate: string;
  endDate: string;
  description: string;
}

function CreateScheduleForm({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (draft: CreateDraft) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<CreateDraft>({
    patientId: '',
    amount: '',
    currency: 'XLM',
    frequency: 'monthly',
    startDate: today,
    endDate: '',
    description: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!/^[a-f\d]{24}$/i.test(draft.patientId.trim())) next.patientId = 'Enter a valid patient ID';
    if (!/^\d+(\.\d{1,7})?$/.test(draft.amount) || Number(draft.amount) <= 0)
      next.amount = 'Enter a positive amount (up to 7 decimals)';
    if (!draft.startDate) next.startDate = 'Start date is required';
    if (draft.endDate && draft.endDate <= draft.startDate)
      next.endDate = 'End date must be after the start date';
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(draft);
  };

  const field =
    'w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';
  const label = 'mb-1 block text-sm font-medium text-neutral-700';
  const err = (k: string) =>
    errors[k] ? <p className="text-danger-500 mt-1 text-xs">{errors[k]}</p> : null;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="rp-patient" className={label}>
          Patient ID *
        </label>
        <input
          id="rp-patient"
          className={field}
          value={draft.patientId}
          onChange={(e) => setDraft((d) => ({ ...d, patientId: e.target.value }))}
        />
        {err('patientId')}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="rp-amount" className={label}>
            Amount *
          </label>
          <input
            id="rp-amount"
            inputMode="decimal"
            className={field}
            placeholder="0.00"
            value={draft.amount}
            onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value.trim() }))}
          />
          {err('amount')}
        </div>
        <AssetSelector
          id="rp-asset"
          label="Asset"
          value={draft.currency}
          onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value as 'XLM' | 'USDC' }))}
        />
      </div>
      <div>
        <label htmlFor="rp-frequency" className={label}>
          Interval
        </label>
        <select
          id="rp-frequency"
          className={field}
          value={draft.frequency}
          onChange={(e) => setDraft((d) => ({ ...d, frequency: e.target.value as Frequency }))}
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f} className="capitalize">
              {f[0].toUpperCase() + f.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="rp-start" className={label}>
            Start date *
          </label>
          <input
            id="rp-start"
            type="date"
            className={field}
            value={draft.startDate}
            onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
          />
          {err('startDate')}
        </div>
        <div>
          <label htmlFor="rp-end" className={label}>
            End date
          </label>
          <input
            id="rp-end"
            type="date"
            className={field}
            min={draft.startDate}
            value={draft.endDate}
            onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
          />
          {err('endDate')}
        </div>
      </div>
      <div>
        <label htmlFor="rp-desc" className={label}>
          Description
        </label>
        <input
          id="rp-desc"
          className={field}
          placeholder="e.g. Monthly physiotherapy plan"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isLoading}>
          Create schedule
        </Button>
      </div>
    </form>
  );
}

function RunHistory({ runs }: { runs: RecurringRun[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-neutral-500">No runs have executed yet.</p>;
  }
  const sorted = [...runs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-neutral-500">
        <tr>
          <th scope="col" className="py-1 pr-4">Run date</th>
          <th scope="col" className="py-1 pr-4">Status</th>
          <th scope="col" className="py-1 pr-4">Transaction</th>
          <th scope="col" className="py-1">Details</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((run, i) => (
          <tr key={run._id ?? `${run.date}-${i}`} className="border-t border-neutral-200">
            <td className="py-2 pr-4">{formatDate(run.date)}</td>
            <td className="py-2 pr-4">
              <Badge variant={RUN_VARIANT[run.status]}>{run.status}</Badge>
            </td>
            <td className="py-2 pr-4">
              {run.transactionHash ? <TxLink hash={run.transactionHash} /> : '—'}
            </td>
            <td className="py-2">
              {run.status === 'failed' ? (
                <span className="text-danger-600">
                  {run.failureReason || 'Unknown error'}
                  {run.retryCount ? ` (retries: ${run.retryCount})` : ''}
                </span>
              ) : (
                <span className="text-neutral-500">{run.intentId ?? ''}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RecurringPaymentsPanel() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<RecurringSchedule | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const {
    data: schedules = [],
    isLoading,
    error,
    refetch,
  } = useQuery<RecurringSchedule[]>({
    queryKey: queryKeys.recurringPayments.list(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/payments/recurring`);
      if (!res.ok) throw await readError(res, 'Failed to load recurring schedules');
      const body = await res.json();
      return body.data ?? [];
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.recurringPayments.all });

  const createMutation = useMutation({
    mutationFn: async (draft: CreateDraft) => {
      const res = await fetchWithAuth(`${API_V1}/payments/recurring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: draft.patientId.trim(),
          amount: draft.amount,
          currency: draft.currency,
          frequency: draft.frequency,
          startDate: new Date(`${draft.startDate}T00:00:00`).toISOString(),
          ...(draft.endDate
            ? { endDate: new Date(`${draft.endDate}T23:59:59`).toISOString() }
            : {}),
          ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
        }),
      });
      if (!res.ok) throw await readError(res, 'Failed to create schedule');
    },
    onSuccess: () => {
      setShowCreate(false);
      setToast({ message: 'Recurring schedule created.', type: 'success' });
      invalidate();
    },
    onError: (e: Error) => setToast({ message: e.message, type: 'error' }),
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'pause' | 'resume' | 'cancel' }) => {
      const url =
        action === 'cancel'
          ? `${API_V1}/payments/recurring/${id}`
          : `${API_V1}/payments/recurring/${id}/${action}`;
      const res = await fetchWithAuth(url, { method: action === 'cancel' ? 'DELETE' : 'PUT' });
      if (!res.ok) throw await readError(res, `Failed to ${action} schedule`);
      return action;
    },
    onSuccess: (action) => {
      const verb = { pause: 'paused', resume: 'resumed', cancel: 'cancelled' }[action];
      setToast({ message: `Schedule ${verb}.`, type: 'success' });
      setCancelTarget(null);
      invalidate();
    },
    onError: (e: Error) => setToast({ message: e.message, type: 'error' }),
  });

  const pendingId = actionMutation.isPending ? actionMutation.variables?.id : undefined;

  return (
    <section aria-labelledby="recurring-heading" className="space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="recurring-heading" className="text-lg font-semibold text-neutral-900">
            Recurring payments
          </h2>
          <p className="text-sm text-neutral-500">
            Scheduled Stellar billing on the{' '}
            <span className="font-medium">{webConfig.stellar.network}</span> network.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New schedule</Button>
      </div>

      {isLoading && (
        <div role="status" className="flex items-center gap-2 py-6 text-neutral-500">
          <Spinner size="sm" /> Loading schedules…
        </div>
      )}
      {error && <ErrorMessage message={(error as Error).message} onRetry={() => refetch()} />}
      {!isLoading && !error && schedules.length === 0 && (
        <p role="status" className="py-6 text-sm text-neutral-500">
          No recurring schedules yet.
        </p>
      )}

      {schedules.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase text-neutral-500">
              <tr>
                <th scope="col" className="px-4 py-3">Patient</th>
                <th scope="col" className="px-4 py-3">Amount</th>
                <th scope="col" className="px-4 py-3">Interval</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Next run</th>
                <th scope="col" className="px-4 py-3">Last run</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {schedules.map((s) => {
                const last = lastRun(s);
                const isOpen = expanded === s._id;
                const busy = pendingId === s._id;
                const ended = s.status === 'cancelled' || s.status === 'completed';
                return (
                  <Fragment key={s._id}>
                    <tr>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs">{s.patientId}</div>
                        {s.description && (
                          <div className="text-xs text-neutral-500">{s.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {s.amount} {s.currency}
                      </td>
                      <td className="px-4 py-3 capitalize">{s.frequency}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[s.status]}>{s.status}</Badge>
                      </td>
                      <td className="px-4 py-3">{ended ? '—' : formatDate(s.nextPaymentDate)}</td>
                      <td className="px-4 py-3">
                        {last ? (
                          <div className="flex flex-col gap-0.5">
                            <span>
                              <Badge variant={RUN_VARIANT[last.status]}>{last.status}</Badge>{' '}
                              <span className="text-xs text-neutral-500">
                                {formatDate(last.date)}
                              </span>
                            </span>
                            {last.status === 'failed' && last.failureReason && (
                              <span className="text-danger-600 text-xs">{last.failureReason}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-neutral-400">Never run</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {s.status === 'active' && (
                            <Button
                              size="sm"
                              variant="outline"
                              loading={busy && actionMutation.variables?.action === 'pause'}
                              disabled={busy}
                              onClick={() => actionMutation.mutate({ id: s._id, action: 'pause' })}
                            >
                              Pause
                            </Button>
                          )}
                          {s.status === 'paused' && (
                            <Button
                              size="sm"
                              variant="outline"
                              loading={busy && actionMutation.variables?.action === 'resume'}
                              disabled={busy}
                              onClick={() => actionMutation.mutate({ id: s._id, action: 'resume' })}
                            >
                              Resume
                            </Button>
                          )}
                          {!ended && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => setCancelTarget(s)}
                            >
                              Cancel
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-expanded={isOpen}
                            aria-controls={`rp-history-${s._id}`}
                            onClick={() => setExpanded(isOpen ? null : s._id)}
                          >
                            History ({s.paymentHistory?.length ?? 0})
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr id={`rp-history-${s._id}`} className="bg-neutral-50">
                        <td colSpan={7} className="px-4 py-3">
                          <RunHistory runs={s.paymentHistory ?? []} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SlideOver
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="New recurring schedule"
      >
        <CreateScheduleForm
          onSubmit={(d) => createMutation.mutate(d)}
          onCancel={() => setShowCreate(false)}
          isLoading={createMutation.isPending}
        />
      </SlideOver>

      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel recurring schedule?"
        description="No further payments will be collected. This cannot be undone."
        size="sm"
      >
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setCancelTarget(null)}>
            Keep schedule
          </Button>
          <Button
            variant="danger"
            loading={actionMutation.isPending}
            onClick={() =>
              cancelTarget && actionMutation.mutate({ id: cancelTarget._id, action: 'cancel' })
            }
          >
            Cancel schedule
          </Button>
        </div>
      </Modal>
    </section>
  );
}
