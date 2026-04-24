'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Payment {
  _id: string;
  intentId: string;
  patientId?: string;
  amount: string;
  status: string;
  txHash?: string;
  createdAt?: string;
}

type DisputeReason = 'duplicate_payment' | 'service_not_rendered' | 'incorrect_amount' | 'other';

const API = 'http://localhost:3001/api/v1/payments';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [disputeTarget, setDisputeTarget] = useState<Payment | null>(null);
  const [disputeForm, setDisputeForm] = useState({ patientId: '', reason: 'duplicate_payment' as DisputeReason, description: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`${API}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setPayments(d.data || d || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function openDispute(intentId: string) {
    const r = await fetch(`${API}/${intentId}/dispute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(disputeForm),
    });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error || 'Failed to open dispute');
    setMsg('Dispute opened successfully.');
    setDisputeTarget(null);
  }

  if (loading) return <p style={{ padding: '2rem' }}>Loading payments...</p>;

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Payments (Stellar)</h1>
        <Link href="/disputes" style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', borderRadius: 6, textDecoration: 'none' }}>
          Manage Disputes
        </Link>
      </div>

      {msg && <p style={{ color: '#10b981', fontWeight: 'bold' }}>{msg}</p>}

      {payments.length === 0 && <p>No payments found. Connect Stellar service.</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {payments.map(payment => (
          <li key={payment._id || payment.intentId} style={{ margin: '10px 0', padding: '12px', border: '1px solid #e5e7eb', borderRadius: 6 }}>
            <strong>ID:</strong> {payment.intentId} &nbsp;|&nbsp;
            <strong>Amount:</strong> {payment.amount} XLM &nbsp;|&nbsp;
            <strong>Status:</strong> {payment.status}
            {payment.txHash && (
              <span> &nbsp;|&nbsp; Tx: <a href={`https://stellar.expert/explorer/testnet/tx/${payment.txHash}`} target="_blank" rel="noreferrer">view</a></span>
            )}
            &nbsp;
            {payment.status === 'confirmed' && (
              <button
                onClick={() => { setDisputeTarget(payment); setMsg(''); }}
                style={{ marginLeft: 12, padding: '3px 10px', cursor: 'pointer', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4 }}
              >
                Open Dispute
              </button>
            )}
          </li>
        ))}
      </ul>

      {disputeTarget && (
        <div style={{ marginTop: '1.5rem', padding: '1.5rem', border: '1px solid #f59e0b', borderRadius: 8, maxWidth: 500 }}>
          <h2>Open Dispute for {disputeTarget.intentId.slice(0, 12)}…</h2>
          <div style={{ marginBottom: 10 }}>
            <label>Patient ID<br />
              <input
                value={disputeForm.patientId}
                onChange={e => setDisputeForm(f => ({ ...f, patientId: e.target.value }))}
                style={{ width: '100%', padding: '6px 8px', marginTop: 4 }}
                placeholder="Patient ID"
              />
            </label>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label>Reason<br />
              <select
                value={disputeForm.reason}
                onChange={e => setDisputeForm(f => ({ ...f, reason: e.target.value as DisputeReason }))}
                style={{ width: '100%', padding: '6px 8px', marginTop: 4 }}
              >
                <option value="duplicate_payment">Duplicate Payment</option>
                <option value="service_not_rendered">Service Not Rendered</option>
                <option value="incorrect_amount">Incorrect Amount</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label>Description<br />
              <textarea
                value={disputeForm.description}
                onChange={e => setDisputeForm(f => ({ ...f, description: e.target.value }))}
                style={{ width: '100%', padding: '6px 8px', marginTop: 4, minHeight: 80 }}
                placeholder="Describe the issue..."
              />
            </label>
          </div>
          <button onClick={() => openDispute(disputeTarget.intentId)} style={{ padding: '6px 16px', cursor: 'pointer', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, marginRight: 8 }}>
            Submit Dispute
          </button>
          <button onClick={() => setDisputeTarget(null)} style={{ padding: '6px 16px', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}
    </main>
  );
}
