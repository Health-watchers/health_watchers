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
  ErrorMessage,
  Modal,
  PageWrapper,
  Skeleton,
  Toast,
} from '@/components/ui';
import {
  ClaimLineItemsEditor,
  validateLineItems,
  type LineItemDraft,
} from '@/components/billing/ClaimLineItemsEditor';
import { queryKeys } from '@/lib/queryKeys';
import {
  ADJUSTMENT_GROUP_LABEL,
  billingFetch,
  BillingError,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_VARIANT,
  CLEARINGHOUSE_LABEL,
  CORRECTABLE_STATUSES,
  downloadCms1500,
  formatMoney,
  MANUAL_TRANSITIONS,
  patientName,
  REMITTABLE_STATUSES,
  RESUBMITTABLE_STATUSES,
  type Claim,
  type ClaimFieldError,
  type ClaimValidationResult,
  type RemittanceAdjustment,
  type ServiceLine,
} from '@/lib/billing';

type Dialog = 'deny' | 'resubmit' | 'correct' | 'write-off' | 'reject' | 'era' | null;

interface EraDraft {
  eraId: string;
  payerName: string;
  checkNumber: string;
  paidAmount: string;
  allowedAmount: string;
  patientResponsibility: string;
  adjustments: { groupCode: RemittanceAdjustment['groupCode']; reasonCode: string; amount: string }[];
}

const emptyEra = (): EraDraft => ({
  eraId: '',
  payerName: '',
  checkNumber: '',
  paidAmount: '',
  allowedAmount: '',
  patientResponsibility: '0',
  adjustments: [{ groupCode: 'CO', reasonCode: '', amount: '' }],
});

function FieldErrors({ errors }: { errors: ClaimFieldError[] }) {
  return (
    <ul className="text-danger-700 list-disc space-y-0.5 pl-5 text-sm">
      {errors.map((e, i) => (
        <li key={i}>
          <span className="font-mono text-xs">Box {e.field}</span> — {e.message}
        </li>
      ))}
    </ul>
  );
}

function formatDateTime(value?: string) {
  return value
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '—';
}

function serviceLines(claim: Claim): ServiceLine[] {
  const lines = claim.cms1500Data?.box24_servicelines;
  if (lines?.length) return lines;
  return claim.cptCodes.map((cptCode) => ({ cptCode, charges: 0, units: 1, dateOfService: '' }));
}

const field =
  'w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

export default function ClaimDetailClient({ claimId }: { claimId: string }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<LineItemDraft[]>([]);
  const [diagnoses, setDiagnoses] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [attachment, setAttachment] = useState({ name: '', url: '' });
  const [fieldErrors, setFieldErrors] = useState<ClaimFieldError[]>([]);
  const [era, setEra] = useState<EraDraft>(emptyEra);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: claim, isLoading, error, refetch } = useQuery<Claim>({
    queryKey: queryKeys.billing.claim(claimId),
    queryFn: async () =>
      (await billingFetch<{ data: Claim }>(`/claims/${encodeURIComponent(claimId)}`)).data,
  });

  const correctable = !!claim && CORRECTABLE_STATUSES.includes(claim.status);
  const validation = useQuery<ClaimValidationResult>({
    queryKey: queryKeys.billing.validation(claimId),
    queryFn: async () =>
      (
        await billingFetch<{ data: ClaimValidationResult }>(
          `/claims/${encodeURIComponent(claimId)}/validation`
        )
      ).data,
    enabled: correctable,
  });

  const action = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) =>
      billingFetch(`/claims/${encodeURIComponent(claimId)}${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    onSuccess: (_d, vars) => {
      const messages: Record<string, string> = {
        '/deny': 'Denial recorded.',
        '/resubmit': 'Claim corrected and resubmitted.',
        '/correct': 'Corrections saved.',
        '/status': 'Claim status updated.',
        '/remittances': 'Remittance posted.',
        '/sync': 'Claim status refreshed from the clearinghouse.',
        '/write-off': 'Claim written off.',
        '/attachments': 'Attachment added.',
      };
      setToast({ message: messages[vars.path] ?? 'Saved.', type: 'success' });
      closeDialog();
      setAttachment({ name: '', url: '' });
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
    },
    onError: (e: Error) => {
      // 422 responses carry per-box CMS-1500 validation errors
      if (e instanceof BillingError && e.fieldErrors.length) {
        setFieldErrors(e.fieldErrors);
        setFormError('The corrected claim has invalid fields.');
      } else {
        setFormError(e.message);
      }
      if (!dialog) setToast({ message: e.message, type: 'error' });
    },
  });

  const closeDialog = () => {
    setDialog(null);
    setReason('');
    setNote('');
    setFormError('');
    setFieldErrors([]);
    setEra(emptyEra());
  };

  const openCorrection = (c: Claim, mode: 'resubmit' | 'correct') => {
    setLines(serviceLines(c).map((l) => ({ cptCode: l.cptCode, amount: l.charges.toFixed(2) })));
    setDiagnoses(c.diagnosisCodes.join(', '));
    setDialog(mode);
  };

  const openEra = (c: Claim) => {
    setEra({ ...emptyEra(), eraId: `ERA-${Date.now()}`, allowedAmount: c.totalAmount.toFixed(2) });
    setDialog('era');
  };

  const download = async () => {
    setDownloading(true);
    try {
      await downloadCms1500(claimId);
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <PageWrapper className="py-8">
        <Skeleton className="h-64 w-full" />
      </PageWrapper>
    );
  }
  if (error || !claim) {
    return (
      <PageWrapper className="py-8">
        <ErrorMessage message={(error as Error)?.message ?? 'Claim not found'} onRetry={() => refetch()} />
      </PageWrapper>
    );
  }

  const lineItems = serviceLines(claim);
  const history = [...(claim.statusHistory ?? [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );
  const canDeny = ['submitted', 'resubmitted', 'accepted'].includes(claim.status);
  const canWriteOff = !['paid', 'written_off'].includes(claim.status);
  const canResubmit = RESUBMITTABLE_STATUSES.includes(claim.status);
  const canPostEra = REMITTABLE_STATUSES.includes(claim.status);
  const manual = MANUAL_TRANSITIONS[claim.status] ?? [];
  const canSync =
    !!claim.clearinghouse?.submissionId &&
    ['submitted', 'resubmitted', 'accepted'].includes(claim.status);
  const remittances = claim.remittances ?? [];
  const corrections = [...(claim.corrections ?? [])].reverse();

  return (
    <PageWrapper className="space-y-6 py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/billing" className="text-primary-600 hover:underline">
          ← Billing workbench
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            Claim for {claim.cms1500Data?.box2_patientName || patientName(claim.patientId)}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            <span className="font-mono">{claim._id}</span> · Encounter{' '}
            <Link href={`/encounters/${claim.encounterId}`} className="font-mono hover:underline">
              {String(claim.encounterId).slice(-8)}
            </Link>
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={CLAIM_STATUS_VARIANT[claim.status]}>
              {CLAIM_STATUS_LABEL[claim.status]}
            </Badge>
            {claim.resubmissionCount > 0 && (
              <span className="text-xs text-neutral-500">
                Resubmitted {claim.resubmissionCount}×
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={download} loading={downloading}>
            Download CMS-1500
          </Button>
          {canSync && (
            <Button
              variant="outline"
              loading={action.isPending && action.variables?.path === '/sync'}
              onClick={() => action.mutate({ path: '/sync', method: 'POST' })}
            >
              Check claim status
            </Button>
          )}
          {canResubmit && (
            <Button onClick={() => openCorrection(claim, 'resubmit')}>Correct & resubmit</Button>
          )}
          {claim.status === 'draft' && (
            <Button variant="outline" onClick={() => openCorrection(claim, 'correct')}>
              Edit claim
            </Button>
          )}
          {manual.includes('accepted') && (
            <Button
              variant="outline"
              onClick={() =>
                action.mutate({
                  path: '/status',
                  method: 'PATCH',
                  body: { status: 'accepted', note: 'Payer acknowledged receipt' },
                })
              }
            >
              Mark accepted
            </Button>
          )}
          {manual.includes('rejected') && (
            <Button variant="outline" onClick={() => setDialog('reject')}>
              Mark rejected
            </Button>
          )}
          {canPostEra && (
            <Button variant="outline" onClick={() => openEra(claim)}>
              Post ERA
            </Button>
          )}
          {canDeny && (
            <Button variant="outline" onClick={() => setDialog('deny')}>
              Record denial
            </Button>
          )}
          {canWriteOff && (
            <Button variant="outline" onClick={() => setDialog('write-off')}>
              Write off
            </Button>
          )}
        </div>
      </header>

      {(claim.status === 'rejected' || claim.status === 'denied') &&
        (claim.denialReason || claim.rejectionReason) && (
          <div className="border-danger-200 bg-danger-50 text-danger-800 rounded-md border p-4 text-sm" role="alert">
            <strong>{claim.status === 'denied' ? 'Denied by payer' : 'Rejected'}:</strong>{' '}
            {claim.status === 'denied' ? (claim.denialReason ?? claim.rejectionReason) : claim.rejectionReason}
            <p className="mt-1 text-xs">
              {claim.status === 'denied'
                ? 'Correct the claim and resubmit it as a replacement (frequency code 7), or write it off.'
                : 'The claim did not reach adjudication. Fix the flagged fields and resubmit.'}
            </p>
          </div>
        )}
      {correctable && validation.data && !validation.data.valid && (
        <div className="border-warning-200 bg-warning-50 rounded-md border p-4" role="status">
          <p className="text-warning-800 mb-2 text-sm font-medium">
            This claim has {validation.data.errors.length} field issue
            {validation.data.errors.length === 1 ? '' : 's'} that will block submission:
          </p>
          <FieldErrors errors={validation.data.errors} />
        </div>
      )}
      {claim.status === 'written_off' && claim.writeOffReason && (
        <div className="border-warning-200 bg-warning-50 text-warning-800 rounded-md border p-4 text-sm">
          <strong>Written off:</strong> {claim.writeOffReason}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs text-neutral-500">
                    <tr>
                      <th scope="col" className="py-2 pr-4">Date of service</th>
                      <th scope="col" className="py-2 pr-4">CPT</th>
                      <th scope="col" className="py-2 pr-4">Units</th>
                      <th scope="col" className="py-2 pr-4">Dx pointers</th>
                      <th scope="col" className="py-2 text-right">Charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((l, i) => (
                      <tr key={i} className="border-t border-neutral-100">
                        <td className="py-2 pr-4">{l.dateOfService || '—'}</td>
                        <td className="py-2 pr-4 font-mono">{l.cptCode}</td>
                        <td className="py-2 pr-4">{l.units}</td>
                        <td className="py-2 pr-4">{l.diagnosisPointers?.join(', ') ?? '—'}</td>
                        <td className="py-2 text-right tabular-nums">{formatMoney(l.charges)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-neutral-300 font-semibold">
                      <td colSpan={4} className="py-2">
                        Total
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatMoney(claim.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-neutral-500">Diagnoses (ICD-10)</dt>
                <dd className="font-mono">{claim.diagnosisCodes.join(', ') || '—'}</dd>
                <dt className="text-neutral-500">Billing NPI</dt>
                <dd className="font-mono">{claim.cms1500Data?.box33_billingProviderNpi ?? '—'}</dd>
                <dt className="text-neutral-500">Submitted</dt>
                <dd>{formatDateTime(claim.submittedAt)}</dd>
                <dt className="text-neutral-500">Clearinghouse</dt>
                <dd>
                  {claim.clearinghouse
                    ? `${CLEARINGHOUSE_LABEL[claim.clearinghouse.provider] ?? claim.clearinghouse.provider}${
                        claim.clearinghouse.lastStatus ? ` · ${claim.clearinghouse.lastStatus}` : ''
                      }`
                    : 'Not transmitted'}
                </dd>
                {claim.clearinghouse?.submissionId && (
                  <>
                    <dt className="text-neutral-500">Tracking ID</dt>
                    <dd className="font-mono text-xs">{claim.clearinghouse.submissionId}</dd>
                  </>
                )}
                {claim.clearinghouse?.payerClaimId && (
                  <>
                    <dt className="text-neutral-500">Payer claim #</dt>
                    <dd className="font-mono text-xs">{claim.clearinghouse.payerClaimId}</dd>
                  </>
                )}
                {claim.clearinghouse?.lastCheckedAt && (
                  <>
                    <dt className="text-neutral-500">Last checked</dt>
                    <dd>{formatDateTime(claim.clearinghouse.lastCheckedAt)}</dd>
                  </>
                )}
                <dt className="text-neutral-500">Paid to date</dt>
                <dd className="tabular-nums">{formatMoney(claim.paidAmount ?? 0)}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Remittance advice (ERA)</CardTitle>
            </CardHeader>
            <CardContent>
              {remittances.length === 0 ? (
                <p className="text-sm text-neutral-500">No remittances received yet.</p>
              ) : (
                <ul className="space-y-4" aria-label="Remittances">
                  {remittances.map((r) => (
                    <li key={r.eraId} className="rounded-md border border-neutral-200 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          {r.payerName ?? 'Payer'} · <span className="font-mono text-xs">{r.eraId}</span>
                        </p>
                        <Badge variant={r.paidAmount > 0 ? 'success' : 'danger'}>
                          {r.paidAmount > 0 ? `Paid ${formatMoney(r.paidAmount)}` : 'Denied'}
                        </Badge>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                        <dt className="text-xs text-neutral-500">Billed</dt>
                        <dd className="tabular-nums">{formatMoney(r.billedAmount)}</dd>
                        <dt className="text-xs text-neutral-500">Allowed</dt>
                        <dd className="tabular-nums">{r.allowedAmount != null ? formatMoney(r.allowedAmount) : '—'}</dd>
                        <dt className="text-xs text-neutral-500">Patient resp.</dt>
                        <dd className="tabular-nums">{formatMoney(r.patientResponsibility)}</dd>
                        <dt className="text-xs text-neutral-500">Received</dt>
                        <dd>{formatDateTime(r.receivedAt)}</dd>
                      </dl>
                      {r.adjustments.length > 0 && (
                        <table className="mt-2 w-full text-xs">
                          <thead className="text-left text-neutral-500">
                            <tr>
                              <th scope="col" className="py-1">Adjustment</th>
                              <th scope="col" className="py-1">Reason</th>
                              <th scope="col" className="py-1 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.adjustments.map((a, i) => (
                              <tr key={i} className="border-t border-neutral-100">
                                <td className="py-1" title={ADJUSTMENT_GROUP_LABEL[a.groupCode]}>
                                  {a.groupCode}
                                </td>
                                <td className="py-1 font-mono">
                                  CARC {a.reasonCode}
                                  {a.remarkCode ? ` / ${a.remarkCode}` : ''}
                                </td>
                                <td className="py-1 text-right tabular-nums">{formatMoney(a.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {r.checkNumber && (
                        <p className="mt-1 text-xs text-neutral-500">
                          {r.paymentMethod ?? 'Payment'} #{r.checkNumber}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {corrections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Corrections</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-neutral-100 text-sm">
                  {corrections.map((c, i) => (
                    <li key={i} className="py-2">
                      <p className="text-xs text-neutral-500">{formatDateTime(c.at)}</p>
                      {c.note && <p className="mt-0.5">{c.note}</p>}
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {Object.entries(c.changes).map(([key, v]) => (
                          <li key={key}>
                            <span className="font-medium">{key}</span>:{' '}
                            <span className="line-through text-neutral-500">{JSON.stringify(v.from)}</span>{' '}
                            → <span className="font-mono">{JSON.stringify(v.to)}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              {(claim.attachments ?? []).length === 0 ? (
                <p className="text-sm text-neutral-500">No supporting documents attached.</p>
              ) : (
                <ul className="divide-y divide-neutral-100 text-sm">
                  {claim.attachments!.map((a) => (
                    <li key={a._id} className="flex items-center justify-between py-2">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline"
                      >
                        {a.name}
                      </a>
                      <span className="text-xs text-neutral-500">{formatDateTime(a.uploadedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="mt-4 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setFormError('');
                  action.mutate({ path: '/attachments', method: 'POST', body: attachment });
                }}
              >
                <input
                  aria-label="Attachment name"
                  placeholder="Name, e.g. Operative note"
                  className={`${field} flex-1`}
                  value={attachment.name}
                  onChange={(e) => setAttachment((a) => ({ ...a, name: e.target.value }))}
                  required
                />
                <input
                  aria-label="Document URL"
                  type="url"
                  placeholder="Document URL"
                  className={`${field} flex-1`}
                  value={attachment.url}
                  onChange={(e) => setAttachment((a) => ({ ...a, url: e.target.value }))}
                  required
                />
                <Button type="submit" variant="outline" loading={action.isPending && !dialog}>
                  Attach
                </Button>
              </form>
              {formError && !dialog && (
                <p className="text-danger-600 mt-2 text-sm" role="alert">
                  {formError}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Status history</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-neutral-500">Created {formatDateTime(claim.createdAt)}.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-neutral-200 pl-4">
                {history.map((h, i) => (
                  <li key={i} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-neutral-400"
                    />
                    <Badge variant={CLAIM_STATUS_VARIANT[h.status]}>
                      {CLAIM_STATUS_LABEL[h.status]}
                    </Badge>
                    <p className="mt-1 text-xs text-neutral-500">{formatDateTime(h.at)}</p>
                    {h.note && <p className="mt-1 text-sm text-neutral-700">{h.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        open={dialog === 'deny' || dialog === 'write-off' || dialog === 'reject'}
        onClose={closeDialog}
        title={
          dialog === 'deny'
            ? 'Record payer denial'
            : dialog === 'reject'
              ? 'Record clearinghouse rejection'
              : 'Write off claim'
        }
        description={
          dialog === 'deny'
            ? 'Enter the denial reason from the remittance (e.g. CARC code and description).'
            : dialog === 'reject'
              ? 'Enter the rejection reason from the 999/277CA acknowledgement.'
              : `Write off ${formatMoney(claim.totalAmount)}. This closes the claim.`
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length < 3) {
              setFormError('Please enter a reason.');
              return;
            }
            if (dialog === 'reject') {
              action.mutate({
                path: '/status',
                method: 'PATCH',
                body: { status: 'rejected', reason: reason.trim() },
              });
              return;
            }
            action.mutate({
              path: dialog === 'deny' ? '/deny' : '/write-off',
              method: 'PATCH',
              body: { reason: reason.trim() },
            });
          }}
        >
          <label htmlFor="claim-reason" className="block text-sm font-medium text-neutral-700">
            Reason *
          </label>
          {dialog === 'write-off' ? (
            <select
              id="claim-reason-preset"
              aria-label="Common write-off reasons"
              className={field}
              value=""
              onChange={(e) => e.target.value && setReason(e.target.value)}
            >
              <option value="">Choose a common reason…</option>
              <option>Timely filing limit exceeded</option>
              <option>Small balance adjustment</option>
              <option>Non-covered service — not billable to patient</option>
              <option>Charity care / financial hardship</option>
              <option>Uncollectible after appeals exhausted</option>
            </select>
          ) : null}
          <textarea
            id="claim-reason"
            rows={3}
            className={field}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {formError && (
            <p className="text-danger-600 text-sm" role="alert">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" variant={dialog === 'write-off' ? 'danger' : 'primary'} loading={action.isPending}>
              {dialog === 'deny' ? 'Record denial' : dialog === 'reject' ? 'Record rejection' : 'Write off'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={dialog === 'resubmit' || dialog === 'correct'}
        onClose={closeDialog}
        title={dialog === 'correct' ? 'Edit claim' : 'Correct & resubmit'}
        description={
          dialog === 'resubmit' && (claim.denialReason || claim.rejectionReason)
            ? `${CLAIM_STATUS_LABEL[claim.status]}: ${claim.denialReason ?? claim.rejectionReason}`
            : undefined
        }
        size="lg"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const dx = diagnoses
              .split(',')
              .map((d) => d.trim().toUpperCase())
              .filter(Boolean);
            const problem = validateLineItems(lines) || (dx.length === 0 && 'Add a diagnosis code');
            if (problem) {
              setFormError(problem);
              return;
            }
            setFieldErrors([]);
            action.mutate({
              path: dialog === 'correct' ? '/correct' : '/resubmit',
              method: 'PATCH',
              body: {
                cptCodes: lines.map((l) => l.cptCode.toUpperCase()),
                amounts: lines.map((l) => Number(l.amount)),
                diagnosisCodes: dx,
                ...(note.trim() ? { note: note.trim() } : {}),
              },
            });
          }}
        >
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-neutral-700">Line items</legend>
            <ClaimLineItemsEditor items={lines} onChange={setLines} />
          </fieldset>
          <div>
            <label htmlFor="rs-dx" className="mb-1 block text-sm font-medium text-neutral-700">
              ICD-10 diagnosis codes
            </label>
            <input
              id="rs-dx"
              className={field}
              value={diagnoses}
              onChange={(e) => setDiagnoses(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="rs-note" className="mb-1 block text-sm font-medium text-neutral-700">
              Correction note
            </label>
            <input
              id="rs-note"
              className={field}
              placeholder="e.g. Added modifier 25, corrected primary diagnosis"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {formError && (
            <p className="text-danger-600 text-sm" role="alert">
              {formError}
            </p>
          )}
          {fieldErrors.length > 0 && <FieldErrors errors={fieldErrors} />}
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            {dialog === 'resubmit' && (
              <Button
                type="button"
                variant="outline"
                loading={action.isPending && action.variables?.path === '/correct'}
                onClick={() => {
                  const dx = diagnoses
                    .split(',')
                    .map((d) => d.trim().toUpperCase())
                    .filter(Boolean);
                  const problem = validateLineItems(lines) || (dx.length === 0 && 'Add a diagnosis code');
                  if (problem) {
                    setFormError(problem);
                    return;
                  }
                  action.mutate({
                    path: '/correct',
                    method: 'PATCH',
                    body: {
                      cptCodes: lines.map((l) => l.cptCode.toUpperCase()),
                      amounts: lines.map((l) => Number(l.amount)),
                      diagnosisCodes: dx,
                      ...(note.trim() ? { note: note.trim() } : {}),
                    },
                  });
                }}
              >
                Save without sending
              </Button>
            )}
            <Button type="submit" loading={action.isPending && action.variables?.path !== '/correct'}>
              {dialog === 'correct' ? 'Save corrections' : 'Resubmit claim'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={dialog === 'era'}
        onClose={closeDialog}
        title="Post remittance (ERA)"
        description="Enter the 835 remittance details for this claim. A zero payment marks the claim denied."
        size="lg"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const paid = Number(era.paidAmount);
            if (!era.eraId.trim() || era.paidAmount === '' || Number.isNaN(paid) || paid < 0) {
              setFormError('ERA ID and a paid amount of 0 or more are required.');
              return;
            }
            const adjustments = era.adjustments
              .filter((a) => a.reasonCode.trim() && a.amount !== '')
              .map((a) => ({ groupCode: a.groupCode, reasonCode: a.reasonCode.trim(), amount: Number(a.amount) }));
            if (adjustments.some((a) => Number.isNaN(a.amount))) {
              setFormError('Adjustment amounts must be numbers.');
              return;
            }
            action.mutate({
              path: '/remittances',
              method: 'POST',
              body: {
                eraId: era.eraId.trim(),
                payerName: era.payerName.trim() || undefined,
                checkNumber: era.checkNumber.trim() || undefined,
                paymentMethod: paid > 0 ? 'ACH' : 'NON',
                billedAmount: claim.totalAmount,
                allowedAmount: era.allowedAmount === '' ? undefined : Number(era.allowedAmount),
                paidAmount: paid,
                patientResponsibility: Number(era.patientResponsibility || 0),
                adjustments,
              },
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['eraId', 'ERA / trace ID *'],
                ['payerName', 'Payer'],
                ['checkNumber', 'Check / EFT number'],
                ['allowedAmount', 'Allowed amount'],
                ['paidAmount', 'Paid amount *'],
                ['patientResponsibility', 'Patient responsibility'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label htmlFor={`era-${key}`} className="mb-1 block text-sm font-medium text-neutral-700">
                  {label}
                </label>
                <input
                  id={`era-${key}`}
                  className={field}
                  inputMode={key.endsWith('Amount') || key === 'patientResponsibility' ? 'decimal' : undefined}
                  value={era[key]}
                  onChange={(e) => setEra((d) => ({ ...d, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-neutral-700">Adjustments (CAS)</legend>
            <div className="space-y-2">
              {era.adjustments.map((a, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <select
                    aria-label={`Adjustment ${i + 1} group`}
                    className={`${field} w-28`}
                    value={a.groupCode}
                    onChange={(e) =>
                      setEra((d) => ({
                        ...d,
                        adjustments: d.adjustments.map((x, j) =>
                          j === i ? { ...x, groupCode: e.target.value as RemittanceAdjustment['groupCode'] } : x
                        ),
                      }))
                    }
                  >
                    {Object.keys(ADJUSTMENT_GROUP_LABEL).map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Adjustment ${i + 1} reason code`}
                    placeholder="CARC, e.g. 45"
                    className={`${field} w-32`}
                    value={a.reasonCode}
                    onChange={(e) =>
                      setEra((d) => ({
                        ...d,
                        adjustments: d.adjustments.map((x, j) => (j === i ? { ...x, reasonCode: e.target.value } : x)),
                      }))
                    }
                  />
                  <input
                    aria-label={`Adjustment ${i + 1} amount`}
                    placeholder="Amount"
                    inputMode="decimal"
                    className={`${field} w-32`}
                    value={a.amount}
                    onChange={(e) =>
                      setEra((d) => ({
                        ...d,
                        adjustments: d.adjustments.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                      }))
                    }
                  />
                  {era.adjustments.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEra((d) => ({ ...d, adjustments: d.adjustments.filter((_, j) => j !== i) }))
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() =>
                setEra((d) => ({
                  ...d,
                  adjustments: [...d.adjustments, { groupCode: 'CO', reasonCode: '', amount: '' }],
                }))
              }
            >
              + Add adjustment
            </Button>
          </fieldset>
          {formError && (
            <p className="text-danger-600 text-sm" role="alert">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" loading={action.isPending}>
              Post remittance
            </Button>
          </div>
        </form>
      </Modal>
    </PageWrapper>
  );
}
