'use client';

import { useState, useMemo } from 'react';
import type { EncounterPaymentLink } from '@/hooks/usePaymentAnalytics';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui';
import { Pagination } from '@/components/ui/Pagination';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'confirmed' || status === 'completed') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'failed') return 'danger';
  return 'default';
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function fmtAmount(amount: string, asset: string) {
  const num = parseFloat(amount);
  return Number.isNaN(num) ? `${amount} ${asset}` : `${num.toLocaleString()} ${asset}`;
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 shadow-sm">
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50">
          <tr>
            {['Patient', 'Encounter', 'Diagnosis', 'Amount', 'Status', 'Date'].map((h) => (
              <th
                key={h}
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 bg-white">
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: 6 }).map((_, j) => (
                <td key={j} className="px-4 py-3">
                  <Skeleton className="h-4 w-full" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface PaymentEncounterTableProps {
  data?: EncounterPaymentLink[] | undefined;
  isLoading?: boolean | undefined;
}

export function PaymentEncounterTable({ data = [], isLoading }: PaymentEncounterTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return data.filter((row) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        row.patientId.toLowerCase().includes(q) ||
        (row.patientName ?? '').toLowerCase().includes(q) ||
        row.encounterId.toLowerCase().includes(q) ||
        (row.diagnosisCode ?? '').toLowerCase().includes(q) ||
        (row.diagnosisDescription ?? '').toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isLoading) return <TableSkeleton />;

  return (
    <section aria-label="Payment to encounter linkage table">
      {/* Filter bar */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          aria-label="Search by patient, encounter or diagnosis"
          placeholder="Search patient, encounter, diagnosis…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
        <select
          aria-label="Filter by payment status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="all">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <span className="text-xs text-neutral-400">
          {filtered.length.toLocaleString()} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 shadow-sm">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              {[
                { label: 'Patient', key: 'patient' },
                { label: 'Encounter ID', key: 'encounter' },
                { label: 'Diagnosis', key: 'diagnosis' },
                { label: 'Amount', key: 'amount' },
                { label: 'Status', key: 'status' },
                { label: 'Date', key: 'date' },
              ].map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-neutral-400">
                  {data.length === 0
                    ? 'No payment-to-encounter links available for this period.'
                    : 'No results match the current filters.'}
                </td>
              </tr>
            ) : (
              paginated.map((row) => (
                <tr
                  key={`${row.paymentId}-${row.encounterId}`}
                  className="transition-colors hover:bg-neutral-50"
                >
                  <td className="px-4 py-3 text-neutral-700">
                    {row.patientName ?? (
                      <span className="font-mono text-xs text-neutral-500">
                        {row.patientId.slice(0, 12)}…
                      </span>
                    )}
                  </td>
                  <td
                    className="max-w-[140px] truncate px-4 py-3 font-mono text-xs text-neutral-500"
                    title={row.encounterId}
                  >
                    {row.encounterId.slice(0, 14)}…
                  </td>
                  <td className="px-4 py-3">
                    {row.diagnosisCode ? (
                      <span
                        className="text-neutral-700"
                        title={row.diagnosisDescription ?? row.diagnosisCode}
                      >
                        <span className="font-medium">{row.diagnosisCode}</span>
                        {row.diagnosisDescription && (
                          <span className="ml-1 text-neutral-400">
                            –{' '}
                            {row.diagnosisDescription.length > 28
                              ? `${row.diagnosisDescription.slice(0, 26)}…`
                              : row.diagnosisDescription}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {fmtAmount(row.amount, row.asset)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-neutral-500">
                    {fmtDate(row.encounterDate)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-end">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </section>
  );
}
