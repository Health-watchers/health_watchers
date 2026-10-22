'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import type { DateRange, GroupBy, PaymentAnalyticsData } from '@/hooks/usePaymentAnalytics';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsExportButtonProps {
  dateRange: DateRange;
  groupBy: GroupBy;
  clinicId?: string | undefined;
  /** Snapshot of current analytics data (used for PDF client-side rendering) */
  analyticsData?: PaymentAnalyticsData | undefined;
  onError?: ((msg: string) => void) | undefined;
}

// ── CSV export ────────────────────────────────────────────────────────────────

function buildCsvParams(dateRange: DateRange, groupBy: GroupBy, clinicId?: string): string {
  const params = new URLSearchParams({
    from: `${dateRange.from}T00:00:00Z`,
    to: `${dateRange.to}T23:59:59Z`,
    groupBy,
  });
  if (clinicId) params.set('clinicId', clinicId);
  return params.toString();
}

async function downloadCsv(
  dateRange: DateRange,
  groupBy: GroupBy,
  clinicId: string | undefined,
  onError: (msg: string) => void
) {
  const qs = buildCsvParams(dateRange, groupBy, clinicId);
  try {
    const res = await fetch(`/api/payments/analytics/export?${qs}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-analytics-${dateRange.from}-to-${dateRange.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    onError(e instanceof Error ? e.message : 'CSV export failed');
  }
}

// ── PDF export (print-to-PDF via a hidden iframe) ─────────────────────────────

function buildPdfHtml(data: PaymentAnalyticsData, dateRange: DateRange): string {
  const fmt = (v: string) =>
    `$${parseFloat(v || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const periodRows = (data.revenueByPeriod ?? [])
    .map(
      (p) =>
        `<tr>
          <td>${p.period}</td>
          <td>${parseFloat(p.xlm).toLocaleString()}</td>
          <td>${parseFloat(p.usdc).toLocaleString()}</td>
          <td>${fmt(p.usdEquivalent)}</td>
          <td>${p.count}</td>
        </tr>`
    )
    .join('');

  const diagRows = (data.topDiagnosesByRevenue ?? [])
    .map(
      (d) =>
        `<tr>
          <td>${d.code}</td>
          <td>${d.description}</td>
          <td>${fmt(d.totalRevenue)}</td>
          <td>${d.count}</td>
        </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Payment Analytics Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111; padding: 32px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { color: #6b7280; margin-bottom: 24px; font-size: 12px; }
    h2 { font-size: 14px; font-weight: 600; margin: 20px 0 8px; color: #374151; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
    .kpi-label { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
    .kpi-value { font-size: 20px; font-weight: 700; color: #111; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #f9fafb; border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; }
    td { border: 1px solid #e5e7eb; padding: 6px 10px; font-size: 12px; }
    tr:nth-child(even) td { background: #fafafa; }
    .footer { margin-top: 32px; color: #9ca3af; font-size: 11px; }
    @media print { @page { margin: 20mm; } body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Payment Analytics Report</h1>
  <p class="subtitle">Period: ${dateRange.from} → ${dateRange.to} · Generated: ${new Date().toLocaleString()}</p>

  <h2>Key Performance Indicators</h2>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Total Collected</div>
      <div class="kpi-value">${fmt(data.totalCollected ?? data.totalRevenue?.usdEquivalent ?? '0')}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Outstanding</div>
      <div class="kpi-value">${fmt(data.totalOutstanding ?? '0')}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Refunded</div>
      <div class="kpi-value">${fmt(data.totalRefunded ?? '0')}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Disputed</div>
      <div class="kpi-value">${fmt(data.totalDisputed ?? '0')}</div>
    </div>
  </div>

  <h2>Revenue by Period</h2>
  <table>
    <thead>
      <tr><th>Period</th><th>XLM</th><th>USDC</th><th>USD Equiv.</th><th>Txns</th></tr>
    </thead>
    <tbody>${periodRows || '<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No data</td></tr>'}</tbody>
  </table>

  ${
    diagRows
      ? `<h2>Top Diagnoses by Revenue</h2>
  <table>
    <thead>
      <tr><th>Code</th><th>Description</th><th>Revenue</th><th>Txns</th></tr>
    </thead>
    <tbody>${diagRows}</tbody>
  </table>`
      : ''
  }

  <div class="footer">Health Watchers · Confidential · HIPAA-compliant report</div>
</body>
</html>`;
}

function triggerPdfPrint(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:fixed;left:-9999px;top:-9999px;width:800px;height:1000px;border:none;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  // Wait for fonts / styles to load
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
      setTimeout(() => document.body.removeChild(iframe), 1500);
    }, 250);
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AnalyticsExportButton({
  dateRange,
  groupBy,
  clinicId,
  analyticsData,
  onError = () => {},
}: AnalyticsExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCsv = async () => {
    setOpen(false);
    setCsvLoading(true);
    await downloadCsv(dateRange, groupBy, clinicId, onError);
    setCsvLoading(false);
  };

  const handlePdf = () => {
    setOpen(false);
    if (!analyticsData) {
      onError('No analytics data available to export as PDF');
      return;
    }
    const html = buildPdfHtml(analyticsData, dateRange);
    triggerPdfPrint(html);
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        disabled={csvLoading}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Export analytics"
      >
        {csvLoading ? (
          <span className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-400 border-t-neutral-700" />
            Exporting…
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export
            <svg
              className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </span>
        )}
      </Button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label="Export options"
            className="absolute right-0 z-20 mt-1.5 min-w-[152px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
          >
            <button
              role="menuitem"
              onClick={handleCsv}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 focus:bg-neutral-50 focus:outline-none"
            >
              <svg
                className="h-4 w-4 text-emerald-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Export CSV
            </button>
            <button
              role="menuitem"
              onClick={handlePdf}
              disabled={!analyticsData}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 focus:bg-neutral-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                className="h-4 w-4 text-rose-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              Export PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}
