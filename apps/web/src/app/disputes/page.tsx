'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';

type DisputeStatus = 'open' | 'under_review' | 'resolved_refund' | 'resolved_no_action' | 'closed';
type DisputeReason = 'duplicate_payment' | 'service_not_rendered' | 'incorrect_amount' | 'other';

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
}

const STATUS_VARIANT: Record<DisputeStatus, 'warning' | 'primary' | 'success' | 'default' | 'danger'> = {
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
  const [resolveForm, setResolveForm] = useState({ status: 'resolved_no_action', resolutionNotes: '' });
  const [refundForm, setRefundForm] = useState({ amount: '', destinationPublicKey: '' });
  const [actionMsg, setActionMsg] = useState('');

  const { data: disputes = [], isLoading, error } = useQuery({
    queryKey: ['disputes'],
    queryFn: fetchDisputes,
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

  if (isLoading) return <div className="flex justify-center p-8"><Spinner /></div>;
  if (error) return <p className="p-8 text-red-600">{(error as Error).message}</p>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Dispute Management</h1>

      {disputes.length === 0 ? (
        <p className="text-gray-500">No disputes found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                {['Payment ID', 'Patient', 'Reason', 'Status', 'Opened', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {disputes.map((d) => (
                <tr key={d._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{d.paymentIntentId.slice(0, 14)}…</td>
                  <td className="px-4 py-3 text-gray-700">{d.patientId}</td>
                  <td className="px-4 py-3 text-gray-700 capitalize">{d.reason.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[d.status]}>
                      {d.status.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(d.openedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setSelected(d); setActionMsg(''); setResolveForm({ status: 'resolved_no_action', resolutionNotes: '' }); setRefundForm({ amount: '', destinationPublicKey: '' }); }}
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
            <div><span className="font-medium">Payment:</span> <span className="font-mono text-xs">{selected.paymentIntentId}</span></div>
            <div><span className="font-medium">Reason:</span> {selected.reason.replace(/_/g, ' ')}</div>
            <div><span className="font-medium">Description:</span> {selected.description}</div>
            <div><span className="font-medium">Status:</span> <Badge variant={STATUS_VARIANT[selected.status]}>{selected.status.replace(/_/g, ' ')}</Badge></div>
            {selected.resolutionNotes && <div><span className="font-medium">Resolution Notes:</span> {selected.resolutionNotes}</div>}
            {selected.refundIntentId && <div><span className="font-medium">Refund Intent:</span> <span className="font-mono text-xs">{selected.refundIntentId}</span></div>}

            {!isResolved(selected) && (
              <>
                <hr className="my-4" />
                <h3 className="font-semibold">Resolve Dispute</h3>
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={resolveForm.status}
                    onChange={(e) => setResolveForm((f) => ({ ...f, status: e.target.value }))}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value="resolved_no_action">Resolved – No Action</option>
                    <option value="closed">Closed</option>
                  </select>
                  <input
                    placeholder="Resolution notes"
                    value={resolveForm.resolutionNotes}
                    onChange={(e) => setResolveForm((f) => ({ ...f, resolutionNotes: e.target.value }))}
                    className="border rounded px-2 py-1 text-sm flex-1 min-w-[200px]"
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
                <div className="flex gap-2 flex-wrap">
                  <input
                    placeholder="Amount (XLM)"
                    value={refundForm.amount}
                    onChange={(e) => setRefundForm((f) => ({ ...f, amount: e.target.value }))}
                    className="border rounded px-2 py-1 text-sm w-32"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                  <input
                    placeholder="Patient Stellar public key"
                    value={refundForm.destinationPublicKey}
                    onChange={(e) => setRefundForm((f) => ({ ...f, destinationPublicKey: e.target.value }))}
                    className="border rounded px-2 py-1 text-sm flex-1 min-w-[260px] font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => refundMutation.mutate(selected._id)}
                    disabled={refundMutation.isPending || !refundForm.amount || !refundForm.destinationPublicKey}
                  >
                    {refundMutation.isPending ? <Spinner size="sm" /> : 'Issue Refund'}
                  </Button>
                </div>
              </>
            )}

            {actionMsg && (
              <p className={`mt-3 text-sm font-medium ${actionMsg.includes('Failed') || actionMsg.includes('error') ? 'text-red-600' : 'text-green-600'}`}>
                {actionMsg}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
