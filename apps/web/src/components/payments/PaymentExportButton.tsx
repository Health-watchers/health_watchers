'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

type Format = 'csv' | 'xlsx';
type Status = 'all' | 'confirmed' | 'pending' | 'failed';
type Currency = 'all' | 'XLM' | 'USDC';

interface ExportState {
  from: string;
  to: string;
  format: Format;
  status: Status;
  currency: Currency;
}

interface Props {
  onError?: (msg: string) => void;
}

export function PaymentExportButton({ onError }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opts, setOpts] = useState<ExportState>({
    from: '',
    to: '',
    format: 'csv',
    status: 'all',
    currency: 'all',
  });

  const handleExport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ format: opts.format, status: opts.status, currency: opts.currency });
      if (opts.from) params.set('from', new Date(opts.from).toISOString());
      if (opts.to) {
        // Include the full end day
        const to = new Date(opts.to);
        to.setHours(23, 59, 59, 999);
        params.set('to', to.toISOString());
      }

      const res = await fetch(`/api/payments/export?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Export failed (${res.status})`);
      }

      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `payments-export.${opts.format}`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err: unknown) {
      onError?.((err as Error).message ?? 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Export
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 id="export-dialog-title" className="text-lg font-semibold text-neutral-900">
              Export Payments
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                From
                <input
                  type="date"
                  value={opts.from}
                  onChange={(e) => setOpts((o) => ({ ...o, from: e.target.value }))}
                  className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                To
                <input
                  type="date"
                  value={opts.to}
                  onChange={(e) => setOpts((o) => ({ ...o, to: e.target.value }))}
                  className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm text-neutral-700">
              Format
              <select
                value={opts.format}
                onChange={(e) => setOpts((o) => ({ ...o, format: e.target.value as Format }))}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (.xlsx)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm text-neutral-700">
              Status
              <select
                value={opts.status}
                onChange={(e) => setOpts((o) => ({ ...o, status: e.target.value as Status }))}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm text-neutral-700">
              Currency
              <select
                value={opts.currency}
                onChange={(e) => setOpts((o) => ({ ...o, currency: e.target.value as Currency }))}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="XLM">XLM</option>
                <option value="USDC">USDC</option>
              </select>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleExport} disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                    Exporting…
                  </span>
                ) : (
                  'Download'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
