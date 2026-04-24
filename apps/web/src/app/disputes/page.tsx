'use client';

import { useState, useEffect } from 'react';

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

const STATUS_COLORS: Record<DisputeStatus, string> = {
  open: '#f59e0b',
  under_review: '#3b82f6',
  resolved_refund: '#10b981',
  resolved_no_action: '#6b7280',
  closed: '#374151',
};

const API = 'http://localhost:3001/api/v1/payments';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [resolveForm, setResolveForm] = useState({ status: 'resolved_no_action', resolutionNotes: '' });
  const [refundForm, setRefundForm] = useState({ amount: '', destinationPublicKey: '' });
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    fetch(`${API}/disputes`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setDisputes(d.data || []); setLoading(false); })
      .catch(() => { setError('Failed to load disputes'); setLoading(false); });
  }, []);

  async function resolve(id: string) {
    const r = await fetch(`${API}/disputes/${id}/resolve`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(resolveForm),
    });
    const d = await r.json();
    if (!r.ok) return setActionMsg(d.error || 'Failed');
    setDisputes(prev => prev.map(x => x._id === id ? d.data : x));
    setSelected(d.data);
    setActionMsg('Dispute resolved.');
  }

  async function issueRefund(id: string) {
    const r = await fetch(`${API}/disputes/${id}/refund`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(refundForm),
    });
    const d = await r.json();
    if (!r.ok) return setActionMsg(d.error || 'Failed');
    setDisputes(prev => prev.map(x => x._id === id ? d.data.dispute : x));
    setSelected(d.data.dispute);
    setActionMsg(`Refund issued. Tx: ${d.data.transactionHash}`);
  }

  if (loading) return <p style={{ padding: '2rem' }}>Loading disputes...</p>;
  if (error) return <p style={{ padding: '2rem', color: 'red' }}>{error}</p>;

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: 900 }}>
      <h1>Dispute Management</h1>
      {disputes.length === 0 && <p>No disputes found.</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            {['Payment ID', 'Patient', 'Reason', 'Status', 'Opened', 'Actions'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {disputes.map(d => (
            <tr key={d._id} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{d.paymentIntentId.slice(0, 12)}…</td>
              <td style={{ padding: '8px 12px' }}>{d.patientId}</td>
              <td style={{ padding: '8px 12px' }}>{d.reason.replace(/_/g, ' ')}</td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{ background: STATUS_COLORS[d.status], color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>
                  {d.status.replace(/_/g, ' ')}
                </span>
              </td>
              <td style={{ padding: '8px 12px', fontSize: 12 }}>{new Date(d.openedAt).toLocaleDateString()}</td>
              <td style={{ padding: '8px 12px' }}>
                <button onClick={() => { setSelected(d); setActionMsg(''); }} style={{ cursor: 'pointer', padding: '4px 10px' }}>
                  Manage
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div style={{ marginTop: '2rem', padding: '1.5rem', border: '1px solid #d1d5db', borderRadius: 8 }}>
          <h2>Dispute: {selected._id}</h2>
          <p><strong>Payment:</strong> {selected.paymentIntentId}</p>
          <p><strong>Reason:</strong> {selected.reason.replace(/_/g, ' ')}</p>
          <p><strong>Description:</strong> {selected.description}</p>
          <p><strong>Status:</strong> {selected.status}</p>
          {selected.resolutionNotes && <p><strong>Resolution Notes:</strong> {selected.resolutionNotes}</p>}
          {selected.refundIntentId && <p><strong>Refund Intent:</strong> {selected.refundIntentId}</p>}

          {!['resolved_refund', 'closed'].includes(selected.status) && (
            <>
              <hr style={{ margin: '1rem 0' }} />
              <h3>Resolve Dispute</h3>
              <select
                value={resolveForm.status}
                onChange={e => setResolveForm(f => ({ ...f, status: e.target.value }))}
                style={{ marginRight: 8, padding: '4px 8px' }}
              >
                <option value="resolved_no_action">Resolved – No Action</option>
                <option value="closed">Closed</option>
              </select>
              <input
                placeholder="Resolution notes"
                value={resolveForm.resolutionNotes}
                onChange={e => setResolveForm(f => ({ ...f, resolutionNotes: e.target.value }))}
                style={{ marginRight: 8, padding: '4px 8px', width: 240 }}
              />
              <button onClick={() => resolve(selected._id)} style={{ padding: '4px 12px', cursor: 'pointer' }}>
                Resolve
              </button>

              <hr style={{ margin: '1rem 0' }} />
              <h3>Issue Refund</h3>
              <input
                placeholder="Refund amount (XLM)"
                value={refundForm.amount}
                onChange={e => setRefundForm(f => ({ ...f, amount: e.target.value }))}
                style={{ marginRight: 8, padding: '4px 8px', width: 160 }}
              />
              <input
                placeholder="Patient Stellar public key"
                value={refundForm.destinationPublicKey}
                onChange={e => setRefundForm(f => ({ ...f, destinationPublicKey: e.target.value }))}
                style={{ marginRight: 8, padding: '4px 8px', width: 300 }}
              />
              <button onClick={() => issueRefund(selected._id)} style={{ padding: '4px 12px', cursor: 'pointer', background: '#10b981', color: '#fff', border: 'none' }}>
                Issue Refund
              </button>
            </>
          )}

          {actionMsg && <p style={{ marginTop: '1rem', color: '#10b981', fontWeight: 'bold' }}>{actionMsg}</p>}
          <button onClick={() => setSelected(null)} style={{ marginTop: '1rem', padding: '4px 12px', cursor: 'pointer' }}>
            Close
          </button>
        </div>
      )}
    </main>
  );
}
