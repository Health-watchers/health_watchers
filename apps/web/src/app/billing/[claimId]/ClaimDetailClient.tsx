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
  billingFetch,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_VARIANT,
  formatMoney,
  patientName,
  type Claim,
  type ServiceLine,
} from '@/lib/billing';

type Dialog = 'deny' | 'resubmit' | 'write-off' | null;

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: claim, isLoading, error, refetch } = useQuery<Claim>({
    queryKey: queryKeys.billing.claim(claimId),
    queryFn: async () =>
      (await billingFetch<{ data: Claim }>(`/claims/${encodeURIComponent(claimId)}`)).data,
  });

  const action = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body: unknown }) =>
      billingFetch(`/claims/${encodeURIComponent(claimId)}${path}`, {
        method,
        body: JSON.stringify(body),
      }),
    onSuccess: (_d, vars) => {
      const messages: Record<string, string> = {
        '/deny': 'Denial recorded.',
        '/resubmit': 'Claim corrected and resubmitted.',
        '/write-off': 'Claim written off.',
        '/attachments': 'Attachment added.',
      };
      setToast({ message: messages[vars.path] ?? 'Saved.', type: 'success' });
      closeDialog();
      setAttachment({ name: '', url: '' });
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const closeDialog = () => {
    setDialog(null);
    setReason('');
    setNote('');
    setFormError('');
  };

  const openResubmit = (c: Claim) => {
    setLines(serviceLines(c).map((l) => ({ cptCode: l.cptCode, amount: l.charges.toFixed(2) })));
    setDiagnoses(c.diagnosisCodes.join(', '));
    setDialog('resubmit');
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
          {claim.status === 'rejected' && (
            <Button onClick={() => openResubmit(claim)}>Correct & resubmit</Button>
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

      {claim.status === 'rejected' && claim.rejectionReason && (
        <div className="border-danger-200 bg-danger-50 text-danger-800 rounded-md border p-4 text-sm" role="alert">
          <strong>Denied:</strong> {claim.rejectionReason}
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
              </dl>
            </CardContent>
          </Card>

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
        open={dialog === 'deny' || dialog === 'write-off'}
        onClose={closeDialog}
        title={dialog === 'deny' ? 'Record payer denial' : 'Write off claim'}
        description={
          dialog === 'deny'
            ? 'Enter the denial reason from the remittance (e.g. CARC code and description).'
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
              {dialog === 'deny' ? 'Record denial' : 'Write off'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={dialog === 'resubmit'}
        onClose={closeDialog}
        title="Correct & resubmit"
        description={claim.rejectionReason ? `Denied: ${claim.rejectionReason}` : undefined}
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
            action.mutate({
              path: '/resubmit',
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
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" loading={action.isPending}>
              Resubmit claim
            </Button>
          </div>
        </form>
      </Modal>
    </PageWrapper>
  );
}
