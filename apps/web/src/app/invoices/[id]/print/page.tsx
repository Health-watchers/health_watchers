'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { TableSkeleton, ErrorMessage, Button } from '@/components/ui';
import { API_V1 } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: string;
  total: string;
}

interface InvoiceDetail {
  _id: string;
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  currency: string;
  subtotal: string;
  total: string;
  creditsApplied?: string;
  dueDate: string;
  createdAt: string;
  paidAt?: string;
  paidTxHash?: string;
  stellarMemo: string;
  stellarDestination: string;
  lineItems: LineItem[];
  patientId: {
    firstName: string;
    lastName: string;
    systemId: string;
    contactNumber?: string;
    address?: string;
  } | null;
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function fetchInvoice(id: string): Promise<InvoiceDetail> {
  const res = await fetch(`${API_V1}/invoices/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load invoice');
  const body = await res.json();
  // API may return { data: {...} } or the object directly
  return body.data ?? body;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading, error } = useQuery<InvoiceDetail>({
    queryKey: ['invoice-print', params.id],
    queryFn: () => fetchInvoice(params.id),
    enabled: !!params.id,
  });

  if (isLoading) return <TableSkeleton columns={4} rows={6} />;
  if (error)
    return (
      <ErrorMessage
        message={error instanceof Error ? error.message : 'Unable to load invoice.'}
        onRetry={() => window.location.reload()}
      />
    );
  if (!data) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">Invoice not found.</p>
          <Button onClick={() => router.push('/invoices')} className="mt-4">
            Back to invoices
          </Button>
        </div>
      </main>
    );
  }

  const patientName = data.patientId
    ? `${data.patientId.firstName} ${data.patientId.lastName}`
    : '—';

  const creditsApplied = parseFloat(data.creditsApplied ?? '0');
  const showCredits = creditsApplied > 0;

  return (
    <>
      {/* ── Print-specific styles ── */}
      <style>{`
        @media print {
          /* Hide everything outside the print root */
          body > *:not(#invoice-print-root) { display: none !important; }
          #invoice-print-root { display: block !important; }

          /* Hide screen-only elements */
          .no-print { display: none !important; }

          /* A4 page */
          @page {
            size: A4;
            margin: 0.75in 0.75in 0.75in 0.75in;
          }

          body {
            background: #ffffff !important;
            color: #000000 !important;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11pt;
            line-height: 1.4;
          }

          /* Table styling */
          table {
            border-collapse: collapse;
            width: 100%;
          }
          th, td {
            border: 1px solid #bbb;
            padding: 4pt 6pt;
            text-align: left;
            font-size: 10pt;
          }
          th {
            background: #eeeeee !important;
            font-weight: bold;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          tr.even-row td {
            background: #f7f9fc !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Remove shadows */
          * {
            box-shadow: none !important;
          }
        }

        @media screen {
          .print-only { display: none; }
        }
      `}</style>

      <div id="invoice-print-root">
        {/* ── Screen toolbar (hidden when printing) ── */}
        <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
          <button
            onClick={() => router.back()}
            className="text-sm font-medium text-blue-700 hover:text-blue-800"
          >
            ← Back
          </button>
          <span className="flex-1 text-sm text-gray-500">
            Print preview — Invoice {data.invoiceNumber} · {patientName}
          </span>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Print / Save as PDF
          </button>
        </div>

        {/* ── Printable invoice document ── */}
        <main className="mx-auto max-w-4xl px-6 py-8 print:p-0">

          {/* ── Header ── */}
          <header className="mb-8 border-b-2 border-gray-800 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {data.clinicName ?? 'Health Watchers Clinic'}
                </h1>
                <p className="text-sm text-gray-600">
                  {data.clinicAddress ?? '123 Medical Plaza, Suite 400'}
                </p>
                {data.clinicPhone && (
                  <p className="text-sm text-gray-600">Phone: {data.clinicPhone}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold uppercase tracking-widest text-gray-900">
                  Invoice
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-gray-700">
                  #{data.invoiceNumber}
                </p>
                <p className="text-sm text-gray-500">Issued: {formatDate(data.createdAt)}</p>
                <p className="text-sm text-gray-500">Due: {formatDate(data.dueDate)}</p>
                <p className="text-sm text-gray-500">
                  Printed: {formatDateTime(new Date().toISOString())}
                </p>
              </div>
            </div>

            {/* Patient billing info */}
            <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <div>
                <p className="font-semibold uppercase tracking-wide text-gray-600">Billed To</p>
                <p className="mt-1 font-medium text-gray-900">{patientName}</p>
                {data.patientId?.systemId && (
                  <p className="text-gray-600">MRN: {data.patientId.systemId}</p>
                )}
                {data.patientId?.contactNumber && (
                  <p className="text-gray-600">Phone: {data.patientId.contactNumber}</p>
                )}
                {data.patientId?.address && (
                  <p className="text-gray-600">{data.patientId.address}</p>
                )}
              </div>
              <div className="text-right">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                    data.status === 'paid'
                      ? 'bg-green-100 text-green-800'
                      : data.status === 'cancelled'
                        ? 'bg-red-100 text-red-700'
                        : data.status === 'sent'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {data.status}
                </span>
                {data.paidAt && (
                  <p className="mt-1 text-sm text-green-700">Paid: {formatDate(data.paidAt)}</p>
                )}
              </div>
            </div>
          </header>

          {/* ── Line items table ── */}
          <section className="mb-8">
            <h2 className="mb-3 border-b border-gray-300 pb-1 text-lg font-bold uppercase tracking-wide text-gray-800">
              Line Items
            </h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-600">
                  <th className="border border-gray-300 px-3 py-2 w-1/2">Description</th>
                  <th className="border border-gray-300 px-3 py-2 text-right">Qty</th>
                  <th className="border border-gray-300 px-3 py-2 text-right">
                    Unit Price ({data.currency})
                  </th>
                  <th className="border border-gray-300 px-3 py-2 text-right">
                    Total ({data.currency})
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.lineItems.map((item, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? '' : 'even-row'}>
                    <td className="border border-gray-300 px-3 py-2 text-gray-900">
                      {item.description}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right text-gray-900">
                      {item.quantity}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right text-gray-900">
                      {item.unitPrice}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-medium text-gray-900">
                      {item.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between border-b border-gray-200 pb-1">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium text-gray-900">
                    {data.subtotal} {data.currency}
                  </span>
                </div>
                {showCredits && (
                  <div className="flex justify-between border-b border-gray-200 pb-1">
                    <span className="text-gray-600">Credits Applied</span>
                    <span className="font-medium text-green-700">
                      −{data.creditsApplied} {data.currency}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-base font-bold">
                  <span className="text-gray-900">Total Due</span>
                  <span className="text-gray-900">
                    {data.total} {data.currency}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ── Stellar Payment Details ── */}
          <section className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
            <h2 className="mb-2 font-bold uppercase tracking-wide text-gray-700">
              Stellar Payment Details
            </h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              <div>
                <span className="font-semibold text-gray-600">Destination: </span>
                <span className="break-all font-mono text-xs text-gray-900">
                  {data.stellarDestination}
                </span>
              </div>
              <div>
                <span className="font-semibold text-gray-600">Memo: </span>
                <span className="font-mono text-xs text-gray-900">{data.stellarMemo}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-600">Amount: </span>
                <span className="text-gray-900">
                  {data.total} {data.currency}
                </span>
              </div>
            </div>
            {data.paidTxHash && (
              <div className="mt-2">
                <span className="font-semibold text-gray-600">Transaction Hash: </span>
                <span className="break-all font-mono text-xs text-gray-900">
                  {data.paidTxHash}
                </span>
              </div>
            )}
          </section>

          {/* ── Print footer ── */}
          <footer className="mt-12 border-t border-gray-300 pt-4 text-xs text-gray-500">
            <p>
              This invoice is issued by {data.clinicName ?? 'Health Watchers Clinic'} and is
              intended for the billed patient. For billing enquiries please contact your clinic.
            </p>
            <p className="mt-1">
              Invoice #{data.invoiceNumber} · Patient: {patientName}
              {data.patientId?.systemId ? ` · MRN: ${data.patientId.systemId}` : ''}
            </p>
          </footer>
        </main>
      </div>
    </>
  );
}
