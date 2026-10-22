'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorMessage,
  PageHeader,
  PageWrapper,
  Pagination,
  Spinner,
  Toast,
} from '@/components/ui';
import { queryKeys } from '@/lib/queryKeys';
import {
  ADJUSTMENT_GROUP_LABEL,
  billingFetch,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_VARIANT,
  formatMoney,
  patientName,
  type ClaimStatus,
  type EraDashboard,
} from '@/lib/billing';

const PAGE_SIZE = 25;

/** Claim lifecycle stages shown as pipeline tiles, in order */
const PIPELINE: ClaimStatus[] = ['submitted', 'resubmitted', 'accepted', 'rejected', 'denied', 'paid'];

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtDate = (v?: string) =>
  v ? new Date(v).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </Card>
  );
}

export default function EraDashboardClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data, isLoading, error, refetch } = useQuery<EraDashboard>({
    queryKey: queryKeys.billing.era(page),
    queryFn: async () =>
      (await billingFetch<{ data: EraDashboard }>(`/claims/era?page=${page}&limit=${PAGE_SIZE}`))
        .data,
  });

  const sync = useMutation({
    mutationFn: () =>
      billingFetch<{ data: { checked: number; changed: number } }>('/claims/sync', {
        method: 'POST',
      }),
    onSuccess: ({ data: r }) => {
      setToast({
        message: `Checked ${r.checked} open claim${r.checked === 1 ? '' : 's'}; ${r.changed} updated.`,
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
    },
    onError: (e: Error) => setToast({ message: e.message, type: 'error' }),
  });

  return (
    <PageWrapper className="space-y-6 py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/billing" className="text-primary-600 hover:underline">
          ← Billing workbench
        </Link>
      </nav>

      <PageHeader
        title="Claims & remittances"
        subtitle="Claim status tracking and Electronic Remittance Advice (835)"
        actions={
          <Button onClick={() => sync.mutate()} loading={sync.isPending}>
            Check open claims
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading remittances" />
        </div>
      ) : error || !data ? (
        <ErrorMessage
          message={(error as Error)?.message ?? 'Unable to load remittances'}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <section aria-label="Claim pipeline" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {PIPELINE.map((s) => (
              <Link
                key={s}
                href={`/billing?queue=${s === 'paid' || s === 'accepted' ? 'accepted' : s === 'rejected' || s === 'denied' ? 'denied' : 'submitted'}`}
                className="hover:border-primary-300 rounded-lg border border-neutral-200 bg-white p-3 transition-colors dark:border-neutral-700 dark:bg-neutral-900"
              >
                <Badge variant={CLAIM_STATUS_VARIANT[s]}>{CLAIM_STATUS_LABEL[s]}</Badge>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {data.byStatus[s]?.count ?? 0}
                </p>
                <p className="text-xs tabular-nums text-neutral-500">
                  {formatMoney(data.byStatus[s]?.amount ?? 0)}
                </p>
              </Link>
            ))}
          </section>

          <section aria-label="Remittance totals" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Paid by payers"
              value={formatMoney(data.summary.paid)}
              hint={`${data.summary.remittanceCount} remittance${data.summary.remittanceCount === 1 ? '' : 's'}`}
            />
            <Stat label="Patient responsibility" value={formatMoney(data.summary.patientResponsibility)} />
            <Stat
              label="Collection rate"
              value={pct(data.summary.collectionRate)}
              hint={`of ${formatMoney(data.summary.billed)} billed`}
            />
            <Stat
              label="Denial rate"
              value={pct(data.summary.denialRate)}
              hint={`${formatMoney(data.summary.adjustments)} in adjustments`}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Recent remittances</CardTitle>
              </CardHeader>
              <CardContent>
                {data.remittances.length === 0 ? (
                  <EmptyState
                    title="No remittances yet"
                    description="ERAs appear here once payers adjudicate submitted claims. Use “Check open claims” to poll the clearinghouse."
                  />
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-left text-xs uppercase text-neutral-500">
                          <tr>
                            <th scope="col" className="py-2 pr-4">Received</th>
                            <th scope="col" className="py-2 pr-4">Patient</th>
                            <th scope="col" className="py-2 pr-4">Payer / ERA</th>
                            <th scope="col" className="py-2 pr-4 text-right">Billed</th>
                            <th scope="col" className="py-2 pr-4 text-right">Paid</th>
                            <th scope="col" className="py-2 pr-4 text-right">Patient</th>
                            <th scope="col" className="py-2">Claim</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.remittances.map(({ claimId, claimStatus, patient, remittance: r }) => (
                            <tr key={`${claimId}-${r.eraId}`} className="border-t border-neutral-100">
                              <td className="py-2 pr-4">{fmtDate(r.receivedAt)}</td>
                              <td className="py-2 pr-4">{patientName(patient)}</td>
                              <td className="py-2 pr-4">
                                <p>{r.payerName ?? '—'}</p>
                                <p className="font-mono text-xs text-neutral-500">{r.eraId}</p>
                              </td>
                              <td className="py-2 pr-4 text-right tabular-nums">
                                {formatMoney(r.billedAmount)}
                              </td>
                              <td className="py-2 pr-4 text-right tabular-nums">
                                {r.paidAmount > 0 ? (
                                  formatMoney(r.paidAmount)
                                ) : (
                                  <Badge variant="danger">Denied</Badge>
                                )}
                              </td>
                              <td className="py-2 pr-4 text-right tabular-nums">
                                {formatMoney(r.patientResponsibility)}
                              </td>
                              <td className="py-2">
                                <Link
                                  href={`/billing/${claimId}`}
                                  className="text-primary-600 hover:underline"
                                >
                                  <Badge variant={CLAIM_STATUS_VARIANT[claimStatus]}>
                                    {CLAIM_STATUS_LABEL[claimStatus]}
                                  </Badge>
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {data.meta.total > PAGE_SIZE && (
                      <div className="mt-4">
                        <Pagination
                          page={page}
                          totalPages={Math.ceil(data.meta.total / PAGE_SIZE)}
                          onPageChange={setPage}
                        />
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top adjustment reasons</CardTitle>
              </CardHeader>
              <CardContent>
                {data.topAdjustments.length === 0 ? (
                  <p className="text-sm text-neutral-500">No adjustments recorded.</p>
                ) : (
                  <ul className="divide-y divide-neutral-100 text-sm">
                    {data.topAdjustments.map((a) => (
                      <li
                        key={`${a.groupCode}-${a.reasonCode}`}
                        className="flex items-center justify-between py-2"
                      >
                        <span>
                          <span className="font-mono">
                            {a.groupCode}-{a.reasonCode}
                          </span>
                          <span className="block text-xs text-neutral-500">
                            {ADJUSTMENT_GROUP_LABEL[a.groupCode]}
                          </span>
                        </span>
                        <span className="text-right tabular-nums">
                          {formatMoney(a.amount)}
                          <span className="block text-xs text-neutral-500">{a.count}×</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </PageWrapper>
  );
}
