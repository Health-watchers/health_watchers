'use client';

import { useEffect, useState } from 'react';
import { portalGet, portalFetch } from '@/lib/portalApi';

interface Invoice {
  _id: string;
  amount: string;
  assetCode: string;
  status: 'pending' | 'confirmed' | 'failed';
  createdAt: string;
  txHash?: string;
}

export default function PortalPaymentsPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    portalGet<Invoice[]>('/invoices')
      .then(setInvoices)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pay = async (id: string) => {
    const txHash = prompt('Enter your Stellar transaction hash after sending payment:');
    if (!txHash) return;
    setPaying(id);
    try {
      const res = await portalFetch(`/invoices/${id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ txHash }),
      });
      if (!res.ok) throw new Error();
      setInvoices((prev) =>
        prev.map((i) => (i._id === id ? { ...i, status: 'confirmed', txHash } : i)),
      );
    } catch {
      alert('Payment submission failed. Please try again.');
    } finally {
      setPaying(null);
    }
  };

  if (loading) return <p className="text-gray-500">Loading…</p>;

  const pending = invoices.filter((i) => i.status === 'pending');
  const history = invoices.filter((i) => i.status !== 'pending');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Payments</h1>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Outstanding Invoices</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-400">No outstanding invoices. You&apos;re all caught up!</p>
        ) : (
          pending.map((i) => (
            <div
              key={i._id}
              className="flex items-center justify-between border-b border-gray-100 py-3 last:border-0"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {i.amount} {i.assetCode}
                </p>
                <p className="text-xs text-gray-400">{new Date(i.createdAt).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => pay(i._id)}
                disabled={paying === i._id}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {paying === i._id ? 'Processing…' : 'Pay via Stellar'}
              </button>
            </div>
          ))
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Payment History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400">No payment history.</p>
        ) : (
          history.map((i) => (
            <div
              key={i._id}
              className="flex items-center justify-between border-b border-gray-100 py-3 last:border-0"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {i.amount} {i.assetCode}
                </p>
                <p className="text-xs text-gray-400">{new Date(i.createdAt).toLocaleDateString()}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${i.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
              >
                {i.status}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
