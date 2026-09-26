'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ErrorMessage,
  PageHeader,
  PageWrapper,
  Pagination,
  SectionErrorBoundary,
  SlideOver,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toast,
} from '@/components/ui';
import { AgingReportChart } from '@/components/billing/AgingReportChart';
import { CreateClaimForm, type CreateClaimPayload } from '@/components/billing/CreateClaimForm';
import { queryKeys } from '@/lib/queryKeys';
import { downloadCsv, objectsToCsv } from '@/lib/utils';
import {
  billingFetch,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_VARIANT,
  formatMoney,
  patientName,
  QUEUE_STATUSES,
  QUEUES,
  queueCount,
  type AgingBucket,
  type BillingQueue,
  type Claim,
  type ClaimCounts,
  type UnbilledEncounter,
} from '@/lib/billing';

const PAGE_SIZE = 50;

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';
}

function UnbilledQueue({
  total,
  onCreateClaim,
}: {
  total: number | null;
  onCreateClaim: (e: UnbilledEncounter) => void;
}) {
  const { data = [], isLoading, error, refetch } = useQuery<UnbilledEncounter[]>({
    queryKey: queryKeys.billing.unbilled(),
    queryFn: async () =>
      (await billingFetch<{ data: UnbilledEncounter[] }>('/queries/unbilled-encounters')).data,
  });

  if (isLoading) return <Spinner label="Loading unbilled encounters" />;
  if (error) return <ErrorMessage message={(error as Error).message} onRetry={() => refetch()} />;
  if (data.length === 0)
    return <p className="py-6 text-sm text-neutral-500">Every encounter has been billed.</p>;

  return (
    <div className="space-y-2">
      {total !== null && total > data.length && (
        <p className="text-xs text-neutral-500">
          Showing the {data.length} most recent of {total} unbilled encounters.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase text-neutral-500">
            <tr>
              <th scope="col" className="px-4 py-3">Service date</th>
              <th scope="col" className="px-4 py-3">Patient</th>
              <th scope="col" className="px-4 py-3">Clinician</th>
              <th scope="col" className="px-4 py-3">Coded</th>
              <th scope="col" className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {data.map((enc) => {
              const doctor =
                typeof enc.attendingDoctorId === 'object' ? enc.attendingDoctorId?.fullName : '';
              const coded = enc.billing?.cptCodes?.length ?? 0;
              return (
                <tr key={enc._id}>
                  <td className="px-4 py-3">{formatDate(enc.createdAt)}</td>
                  <td className="px-4 py-3 font-medium">{patientName(enc.patientId)}</td>
                  <td className="px-4 py-3">{doctor || '—'}</td>
                  <td className="px-4 py-3">
                    {coded ? (
                      <Badge variant="success">{coded} CPT</Badge>
                    ) : (
                      <Badge variant="warning">Not coded</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" onClick={() => onCreateClaim(enc)}>
                      Create claim
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClaimsQueue({
  queue,
  onToast,
}: {
  queue: Exclude<BillingQueue, 'unbilled'>;
  onToast: (t: { message: string; type: 'success' | 'error' }) => void;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const statusParam = QUEUE_STATUSES[queue].join(',');

  const { data, isLoading, error, refetch } = useQuery<{
    data: Claim[];
    meta: { total: number };
  }>({
    queryKey: queryKeys.billing.claims(statusParam, page),
    queryFn: () =>
      billingFetch(`/claims?status=${statusParam}&page=${page}&limit=${PAGE_SIZE}`),
  });
  const claims = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  useEffect(() => setSelected(new Set()), [queue, page]);

  const submitMutation = useMutation({
    mutationFn: (claimIds: string[]) =>
      billingFetch<{ data: { submitted: string[]; skipped: string[] } }>('/claims/submit', {
        method: 'POST',
        body: JSON.stringify({ claimIds }),
      }),
    onSuccess: ({ data: result }) => {
      setSelected(new Set());
      onToast({
        message: `${result.submitted.length} claim(s) submitted${
          result.skipped.length ? `, ${result.skipped.length} skipped (not in draft)` : ''
        }.`,
        type: result.submitted.length ? 'success' : 'error',
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
    },
    onError: (e: Error) => onToast({ message: e.message, type: 'error' }),
  });

  const allOnPage = claims.length > 0 && claims.every((c) => selected.has(c._id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportSelected = () => {
    const rows = claims
      .filter((c) => selected.has(c._id))
      .map((c) => ({
        claimId: c._id,
        encounterId: c.encounterId,
        patient: patientName(c.patientId),
        status: CLAIM_STATUS_LABEL[c.status],
        cptCodes: c.cptCodes.join(' '),
        diagnosisCodes: c.diagnosisCodes.join(' '),
        totalAmount: c.totalAmount.toFixed(2),
        submittedAt: c.submittedAt ?? '',
        denialReason: c.rejectionReason ?? '',
        writeOffReason: c.writeOffReason ?? '',
        resubmissions: c.resubmissionCount ?? 0,
        createdAt: c.createdAt,
      }));
    downloadCsv(objectsToCsv(rows), `claims-${queue}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (isLoading) return <Spinner label="Loading claims" />;
  if (error) return <ErrorMessage message={(error as Error).message} onRetry={() => refetch()} />;
  if (claims.length === 0)
    return <p className="py-6 text-sm text-neutral-500">No claims in this queue.</p>;

  return (
    <div className="space-y-3">
      <div
        className="flex min-h-[2.5rem] flex-wrap items-center gap-3 rounded-md bg-neutral-50 px-3 py-2"
        aria-live="polite"
      >
        <span className="text-sm text-neutral-600">
          {selected.size ? `${selected.size} selected` : `${total} claim${total === 1 ? '' : 's'}`}
        </span>
        {queue === 'draft' && (
          <Button
            size="sm"
            disabled={selected.size === 0}
            loading={submitMutation.isPending}
            onClick={() => submitMutation.mutate([...selected])}
          >
            Submit selected
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={selected.size === 0} onClick={exportSelected}>
          Export selected (CSV)
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase text-neutral-500">
            <tr>
              <th scope="col" className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all claims on this page"
                  checked={allOnPage}
                  onChange={() =>
                    setSelected(allOnPage ? new Set() : new Set(claims.map((c) => c._id)))
                  }
                />
              </th>
              <th scope="col" className="px-4 py-3">Created</th>
              <th scope="col" className="px-4 py-3">Patient</th>
              <th scope="col" className="px-4 py-3">CPT</th>
              <th scope="col" className="px-4 py-3 text-right">Amount</th>
              <th scope="col" className="px-4 py-3">Status</th>
              {queue === 'denied' && <th scope="col" className="px-4 py-3">Denial reason</th>}
              {queue === 'written_off' && <th scope="col" className="px-4 py-3">Reason</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {claims.map((c) => (
              <tr key={c._id} className={selected.has(c._id) ? 'bg-primary-50' : undefined}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select claim for ${patientName(c.patientId)}`}
                    checked={selected.has(c._id)}
                    onChange={() => toggle(c._id)}
                  />
                </td>
                <td className="px-4 py-3">{formatDate(c.createdAt)}</td>
                <td className="px-4 py-3">
                  <Link href={`/billing/${c._id}`} className="font-medium text-primary-600 hover:underline">
                    {patientName(c.patientId)}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{c.cptCodes.join(', ')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(c.totalAmount)}</td>
                <td className="px-4 py-3">
                  <Badge variant={CLAIM_STATUS_VARIANT[c.status]}>{CLAIM_STATUS_LABEL[c.status]}</Badge>
                  {c.resubmissionCount > 0 && (
                    <span className="ml-1 text-xs text-neutral-500">×{c.resubmissionCount}</span>
                  )}
                </td>
                {queue === 'denied' && (
                  <td className="text-danger-700 px-4 py-3 text-xs">{c.rejectionReason ?? '—'}</td>
                )}
                {queue === 'written_off' && (
                  <td className="px-4 py-3 text-xs">{c.writeOffReason ?? '—'}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} onPageChange={setPage} />
      )}
    </div>
  );
}

export default function BillingClient() {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<BillingQueue>('unbilled');
  const [claimFor, setClaimFor] = useState<UnbilledEncounter | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('queue') as BillingQueue;
    if (QUEUES.some((x) => x.value === q)) setQueue(q);
  }, []);

  const changeQueue = (next: string) => {
    setQueue(next as BillingQueue);
    const url = new URL(window.location.href);
    url.searchParams.set('queue', next);
    window.history.replaceState(null, '', url);
  };

  const counts = useQuery<ClaimCounts>({
    queryKey: queryKeys.billing.counts(),
    queryFn: async () => (await billingFetch<{ data: ClaimCounts }>('/claims/counts')).data,
    refetchInterval: 60_000,
  });

  const aging = useQuery<AgingBucket[]>({
    queryKey: queryKeys.billing.aging(),
    queryFn: async () => (await billingFetch<{ data: AgingBucket[] }>('/queries/aging-report')).data,
  });

  const createClaim = useMutation({
    mutationFn: ({ encounterId, payload }: { encounterId: string; payload: CreateClaimPayload }) =>
      billingFetch(`/encounters/${encodeURIComponent(encounterId)}/generate-claim`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setClaimFor(null);
      setToast({ message: 'Claim generated and moved to Ready to submit.', type: 'success' });
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
    },
  });

  return (
    <PageWrapper className="py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="mb-6">
        <PageHeader title="Billing workbench" />
      </div>

      <div className="mb-6">
        <SectionErrorBoundary name="aging report">
          <AgingReportChart buckets={aging.data} isLoading={aging.isLoading} />
        </SectionErrorBoundary>
      </div>

      {counts.error && (
        <ErrorMessage
          message={`Queue counts unavailable: ${(counts.error as Error).message}`}
          onRetry={() => counts.refetch()}
        />
      )}

      <Tabs value={queue} onValueChange={changeQueue}>
        <TabsList className="mb-2 overflow-x-auto">
          {QUEUES.map((q) => {
            const n = queueCount(counts.data, q.value);
            return (
              <TabsTrigger key={q.value} value={q.value} className="whitespace-nowrap">
                {q.label}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums ${
                    q.value === 'denied' && n ? 'bg-danger-50 text-danger-700' : 'bg-neutral-100 text-neutral-600'
                  }`}
                  aria-label={n === null ? 'count loading' : `${n} items`}
                >
                  {n ?? '…'}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="unbilled">
          <UnbilledQueue total={queueCount(counts.data, 'unbilled')} onCreateClaim={setClaimFor} />
        </TabsContent>
        {QUEUES.filter((q) => q.value !== 'unbilled').map((q) => (
          <TabsContent key={q.value} value={q.value}>
            <ClaimsQueue queue={q.value as Exclude<BillingQueue, 'unbilled'>} onToast={setToast} />
          </TabsContent>
        ))}
      </Tabs>

      <SlideOver
        isOpen={!!claimFor}
        onClose={() => {
          setClaimFor(null);
          createClaim.reset();
        }}
        title="Create claim"
        subtitle={claimFor ? `Encounter of ${formatDate(claimFor.createdAt)}` : undefined}
      >
        {claimFor && (
          <CreateClaimForm
            key={claimFor._id}
            encounter={claimFor}
            isLoading={createClaim.isPending}
            error={createClaim.error ? (createClaim.error as Error).message : undefined}
            onCancel={() => setClaimFor(null)}
            onSubmit={(payload) => createClaim.mutate({ encounterId: claimFor._id, payload })}
          />
        )}
      </SlideOver>
    </PageWrapper>
  );
}
