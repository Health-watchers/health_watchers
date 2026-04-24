'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  EmptyState,
  ErrorMessage,
  PageWrapper,
  Toast,
} from '@/components/ui';
import { API_V1 } from '@/lib/api';

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

interface Invoice {
  _id: string;
  invoiceNumber: string;
  patientId: { firstName: string; lastName: string; systemId: string } | null;
  total: string;
  currency: string;
  status: InvoiceStatus;
  dueDate: string;
  createdAt: string;
}

const STATUS_VARIANT: Record<InvoiceStatus, 'default' | 'warning' | 'success' | 'danger'> = {
  draft: 'default',
  sent: 'warning',
  paid: 'success',
  cancelled: 'danger',
};

async function fetchInvoices(): Promise<Invoice[]> {
  const res = await fetch(`${API_V1}/invoices`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load invoices');
  const data = await res.json();
  return data.data ?? [];
}

export default function InvoicesClient() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: invoices = [], isLoading, error } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: fetchInvoices,
  });

  const handleDownloadPDF = async (id: string, invoiceNumber: string) => {
    try {
      const res = await fetch(`${API_V1}/invoices/${id}/pdf`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to download PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setToast({ message: 'Failed to download PDF', type: 'error' });
    }
  };

  const handleSend = async (id: string) => {
    try {
      const res = await fetch(`${API_V1}/invoices/${id}/send`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to send invoice');
      setToast({ message: 'Invoice sent to patient', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch {
      setToast({ message: 'Failed to send invoice', type: 'error' });
    }
  };

  return (
    <PageWrapper className="py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Invoices</h1>
        <Button onClick={() => window.location.href = '/invoices/new'}>+ New Invoice</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-neutral-100" />)}
        </div>
      ) : error ? (
        <ErrorMessage message="Failed to load invoices" onRetry={() => queryClient.invalidateQueries({ queryKey: ['invoices'] })} />
      ) : invoices.length === 0 ? (
        <EmptyState title="No invoices yet" icon="📄" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-neutral-700">Invoice #</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-700">Patient</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-700">Amount</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-700">Due Date</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-700">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-neutral-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv._id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">
                    {inv.patientId ? `${inv.patientId.firstName} ${inv.patientId.lastName}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-medium">{inv.total} {inv.currency}</td>
                  <td className="px-4 py-3 text-neutral-600">{new Date(inv.dueDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[inv.status]}>{inv.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleDownloadPDF(inv._id, inv.invoiceNumber)}
                        className="text-xs text-primary-600 hover:underline"
                      >
                        PDF
                      </button>
                      {inv.status === 'draft' && (
                        <button
                          onClick={() => handleSend(inv._id)}
                          className="text-xs text-primary-600 hover:underline"
                        >
                          Send
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageWrapper>
  );
}
