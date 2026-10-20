'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { DisputeFilingForm } from '@/components/disputes/DisputeFilingForm';

type DisputeStatus = 'open' | 'under_review' | 'resolved_refund' | 'resolved_no_action' | 'closed';
type DisputeReason = 'duplicate_payment' | 'service_not_rendered' | 'incorrect_amount' | 'other';
type ResolutionAction = 'accept' | 'reject' | 'counter_offer';

interface DisputeEvent {
  _id?: string;
  type: string;
  actor?: string;
  message?: string;
  createdAt: string;
}

interface DisputeDocument {
  _id?: string;
  name: string;
  url: string;
  uploadedAt?: string;
}

interface Dispute {
  _id: string;
  paymentIntentId: string;
  patientId: string;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  openedBy: string;
  openedAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  refundIntentId?: string;
  timeline?: DisputeEvent[];
  documents?: DisputeDocument[];
}

const STATUS_OPTIONS: { value: DisputeStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'under_review', label: 'Under review' },
  { value: 'resolved_refund', label: 'Resolved – Refund' },
  { value: 'resolved_no_action', label: 'Resolved – No action' },
  { value: 'closed', label: 'Closed' },
];

const RESOLUTION_ACTIONS: { value: ResolutionAction; label: string }[] = [
  { value: 'accept', label: 'Accept' },
  { value: 'reject', label: 'Reject' },
  { value: 'counter_offer', label: 'Counter-offer' },
];

function escapeCsv(value: unknown): string {
  const str = value == null ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadBlob(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportDisputesCsv(disputes: Dispute[]) {
  const headers = [
    'Dispute ID',
    'Payment Intent',
    'Patient',
    'Reason',
    'Status',
    'Opened By',
    'Opened At',
    'Resolved At',
    'Resolution Notes',
  ];
  const rows = disputes.map((d) =>
    [
      d._id,
      d.paymentIntentId,
      d.patientId,
      d.reason,
      d.status,
      d.openedBy,
      d.openedAt,
      d.resolvedAt ?? '',
      d.resolutionNotes ?? '',
    ]
      .map(escapeCsv)
      .join(',')
  );
  downloadBlob([headers.join(','), ...rows].join('\n'), 'disputes.csv', 'text/csv;charset=utf-8');
}

function exportDisputesPdf(disputes: Dispute[]) {
  const rows = disputes
    .map(
      (d) =>
        `<tr><td>${d._id}</td><td>${d.paymentIntentId}</td><td>${d.patientId}</td><td>${d.reason}</td><td>${d.status}</td><td>${new Date(d.openedAt).toLocaleDateString()}</td></tr>`
    )
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Disputes</title>
<style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px;text-align:left}th{background:#f5f5f5}</style>
</head><body><h1>Dispute Records</h1><table><thead><tr><th>ID</th><th>Payment</th><th>Patient</th><th>Reason</th><th>Status</th><th>Opened</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

const STATUS_VARIANT: Record<
  DisputeStatus,
  'warning' | 'primary' | 'success' | 'default' | 'danger'
> = {
  open: 'warning',
  under_review: 'primary',
  resolved_refund: 'success',
  resolved_no_action: 'default',
  closed: 'default',
};

const DISPUTES_URL = `${API_V1}/payments/disputes`;

async function fetchDisputes(): Promise<Dispute[]> {
  const res = await fetchWithAuth(DISPUTES_URL);
  if (!res.ok) throw new Error(`Failed to load disputes (${res.status})`);
  const data = await res.json();
  return data.data ?? [];
}

export default function DisputesPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [resolveForm, setResolveForm] = useState({
    status: 'resolved_no_action',
    resolutionNotes: '',
  });
  const [refundForm, setRefundForm] = useState({ amount: '', destinationPublicKey: '' });
  const [actionMsg, setActionMsg] = useState('');
  const [statusFilter, setStatusFilter] = useState<DisputeStatus | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filingOpen, setFilingOpen] = useState(false);

  const {
    data: disputes = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['disputes'],
    queryFn: fetchDisputes,
  });

  const filteredDisputes = useMemo(() => {
    return disputes.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      const opened = new Date(d.openedAt).getTime();
      if (dateFrom && opened < new Date(dateFrom).getTime()) return false;
      if (dateTo && opened > new Date(`${dateTo}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [disputes, statusFilter, dateFrom, dateTo]);

  const resolutionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: ResolutionAction }) => {
      const res = await fetchWithAuth(`${DISPUTES_URL}/${id}/resolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: resolveForm.resolutionNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action.replace(/_/g, ' ')} dispute`);
      return data.data as Dispute;
    },
    onSuccess: (updated, { action }) => {
      queryClient.setQueryData<Dispute[]>(['disputes'], (prev = []) =>
        prev.map((d) => (d._id === updated._id ? updated : d))
      );
      setSelected(updated);
      setActionMsg(`Dispute ${action.replace(/_/g, ' ')} recorded successfully.`);
    },
    onError: (err: Error) => setActionMsg(err.message),
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchWithAuth(`${DISPUTES_URL}/${id}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolveForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resolve dispute');
      return data.data as Dispute;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Dispute[]>(['disputes'], (prev = []) =>
        prev.map((d) => (d._id === updated._id ? updated : d))
      );
      setSelected(updated);
      setActionMsg('Dispute resolved successfully.');
    },
    onError: (err: Error) => setActionMsg(err.message),
  });

  const refundMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchWithAuth(`${DISPUTES_URL}/${id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(refundForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to issue refund');
      return data.data as { dispute: Dispute; transactionHash: string; refundIntentId: string };
    },
    onSuccess: ({ dispute: updated, transactionHash }) => {
      queryClient.setQueryData<Dispute[]>(['disputes'], (prev = []) =>
        prev.map((d) => (d._id === updated._id ? updated : d))
      );
      setSelected(updated);
      setActionMsg(`Refund issued. Transaction: ${transactionHash}`);
    },
    onError: (err: Error) => setActionMsg(err.message),
  });

  const isResolved = (d: Dispute) => ['resolved_refund', 'closed'].includes(d.status);

  if (isLoading)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  if (error) return <p className="p-8 text-red-600">{(error as Error).message}</p>;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Dispute Management</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => setFilingOpen(true)}>
            File Dispute
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportDisputesCsv(filteredDisputes)}
            disabled={filteredDisputes.length === 0}
          >
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportDisputesPdf(filteredDisputes)}
            disabled={filteredDisputes.length === 0}
          >
            Export PDF
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DisputeStatus | 'all')}
            className="rounded border px-2 py-1"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border px-2 py-1"
          />
        </label>
        {(statusFilter !== 'all' || dateFrom || dateTo) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStatusFilter('all');
              setDateFrom('');
              setDateTo('');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {filteredDisputes.length === 0 ? (
        <p className="text-gray-500">No disputes found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                {['Payment ID', 'Patient', 'Reason', 'Status', 'Opened', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredDisputes.map((d) => (
                <tr key={d._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{d.paymentIntentId.slice(0, 14)}…</td>
                  <td className="px-4 py-3 text-gray-700">{d.patientId}</td>
                  <td className="px-4 py-3 capitalize text-gray-700">
                    {d.reason.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[d.status]}>{d.status.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(d.openedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelected(d);
                        setActionMsg('');
                        setResolveForm({ status: 'resolved_no_action', resolutionNotes: '' });
                        setRefundForm({ amount: '', destinationPublicKey: '' });
                      }}
                    >
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`Dispute — ${selected._id.slice(-8)}`}>
          <div className="space-y-3 text-sm">
            <div>
              <span className="font-medium">Payment:</span>{' '}
              <span className="font-mono text-xs">{selected.paymentIntentId}</span>
            </div>
            <div>
              <span className="font-medium">Reason:</span> {selected.reason.replace(/_/g, ' ')}
            </div>
            <div>
              <span className="font-medium">Description:</span> {selected.description}
            </div>
            <div>
              <span className="font-medium">Status:</span>{' '}
              <Badge variant={STATUS_VARIANT[selected.status]}>
                {selected.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            {selected.resolutionNotes && (
              <div>
                <span className="font-medium">Resolution Notes:</span> {selected.resolutionNotes}
              </div>
            )}
            {selected.refundIntentId && (
              <div>
                <span className="font-medium">Refund Intent:</span>{' '}
                <span className="font-mono text-xs">{selected.refundIntentId}</span>
              </div>
            )}

            <hr className="my-4" />
            <h3 className="font-semibold">Timeline</h3>
            {selected.timeline && selected.timeline.length > 0 ? (
              <ol className="space-y-2 border-l border-gray-200 pl-4">
                {selected.timeline.map((event, idx) => (
                  <li key={event._id ?? idx} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-blue-500" />
                    <div className="text-xs text-gray-500">
                      {new Date(event.createdAt).toLocaleString()}
                      {event.actor ? ` · ${event.actor}` : ''}
                    </div>
                    <div className="text-gray-800">
                      <span className="font-medium capitalize">{event.type.replace(/_/g, ' ')}</span>
                      {event.message ? ` — ${event.message}` : ''}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-gray-500">No timeline events recorded.</p>
            )}

            <hr className="my-4" />
            <h3 className="font-semibold">Documents</h3>
            {selected.documents && selected.documents.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">
                {selected.documents.map((doc, idx) => (
                  <li key={doc._id ?? idx}>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline"
                    >
                      {doc.name}
                    </a>
                    {doc.uploadedAt && (
                      <span className="ml-2 text-xs text-gray-500">
                        {new Date(doc.uploadedAt).toLocaleDateString()}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No documents attached.</p>
            )}

            {!isResolved(selected) && (
              <>
                <hr className="my-4" />
                <h3 className="font-semibold">Resolution Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {RESOLUTION_ACTIONS.map((a) => (
                    <Button
                      key={a.value}
                      size="sm"
                      variant={a.value === 'accept' ? 'primary' : 'outline'}
                      onClick={() =>
                        resolutionMutation.mutate({ id: selected._id, action: a.value })
                      }
                      disabled={resolutionMutation.isPending}
                    >
                      {resolutionMutation.isPending &&
                      resolutionMutation.variables?.action === a.value ? (
                        <Spinner size="sm" />
                      ) : (
                        a.label
                      )}
                    </Button>
                  ))}
                </div>
                <input
                  placeholder="Notes for resolution action"
                  value={resolveForm.resolutionNotes}
                  onChange={(e) =>
                    setResolveForm((f) => ({ ...f, resolutionNotes: e.target.value }))
                  }
                  className="mt-2 w-full rounded border px-2 py-1 text-sm"
                />

                <hr className="my-4" />
                <h3 className="font-semibold">Resolve Dispute</h3>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={resolveForm.status}
                    onChange={(e) => setResolveForm((f) => ({ ...f, status: e.target.value }))}
                    className="rounded border px-2 py-1 text-sm"
                  >
                    <option value="resolved_no_action">Resolved – No Action</option>
                    <option value="closed">Closed</option>
                  </select>
                  <input
                    placeholder="Resolution notes"
                    value={resolveForm.resolutionNotes}
                    onChange={(e) =>
                      setResolveForm((f) => ({ ...f, resolutionNotes: e.target.value }))
                    }
                    className="min-w-[200px] flex-1 rounded border px-2 py-1 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => resolveMutation.mutate(selected._id)}
                    disabled={resolveMutation.isPending}
                  >
                    {resolveMutation.isPending ? <Spinner size="sm" /> : 'Resolve'}
                  </Button>
                </div>

                <hr className="my-4" />
                <h3 className="font-semibold">Issue Refund</h3>
                <div className="flex flex-wrap gap-2">
                  <input
                    placeholder="Amount (XLM)"
                    value={refundForm.amount}
                    onChange={(e) => setRefundForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-32 rounded border px-2 py-1 text-sm"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                  <input
                    placeholder="Patient Stellar public key"
                    value={refundForm.destinationPublicKey}
                    onChange={(e) =>
                      setRefundForm((f) => ({ ...f, destinationPublicKey: e.target.value }))
                    }
                    className="min-w-[260px] flex-1 rounded border px-2 py-1 font-mono text-sm text-xs"
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => refundMutation.mutate(selected._id)}
                    disabled={
                      refundMutation.isPending ||
                      !refundForm.amount ||
                      !refundForm.destinationPublicKey
                    }
                  >
                    {refundMutation.isPending ? <Spinner size="sm" /> : 'Issue Refund'}
                  </Button>
                </div>
              </>
            )}

            {actionMsg && (
              <p
                className={`mt-3 text-sm font-medium ${actionMsg.includes('Failed') || actionMsg.includes('error') ? 'text-red-600' : 'text-green-600'}`}
              >
                {actionMsg}
              </p>
            )}
          </div>
        </Modal>
      )}

      {filingOpen && (
        <Modal open onClose={() => setFilingOpen(false)} title="File a Dispute">
          <DisputeFilingForm
            onSuccess={() => {
              setFilingOpen(false);
              setActionMsg('Dispute filed successfully.');
              queryClient.invalidateQueries({ queryKey: ['disputes'] });
            }}
            onCancel={() => setFilingOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}
