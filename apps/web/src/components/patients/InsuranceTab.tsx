'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '@health-watchers/types';
import { Badge, Button, EmptyState } from '@/components/ui';
import { API_V1 } from '@/lib/api';

interface InsuranceRecord {
  _id: string;
  provider: string;
  policyNumber: string;
  groupNumber?: string;
  coverageType: string;
  effectiveDate?: string;
  expirationDate?: string;
  isPrimary: boolean;
}

const COVERAGE_TYPES = [
  'HMO',
  'PPO',
  'EPO',
  'POS',
  'HDHP',
  'Medicare',
  'Medicaid',
  'other',
] as const;

const EMPTY_INSURANCE = {
  provider: '',
  policyNumber: '',
  groupNumber: '',
  coverageType: 'PPO',
  effectiveDate: '',
  expirationDate: '',
  isPrimary: false,
};

export function InsuranceTab({ patientId, canEdit }: { patientId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_INSURANCE });
  const [error, setError] = useState<string | null>(null);

  const queryKey = ['insurance', patientId];

  const { data: records = [], isLoading } = useQuery<InsuranceRecord[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`${API_V1}/patients/${patientId}/insurance`);
      if (!res.ok) return [];
      return (await res.json()).data ?? [];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = {
      provider: form.provider,
      policyNumber: form.policyNumber,
      coverageType: form.coverageType,
      isPrimary: form.isPrimary,
    };
    if (form.groupNumber) payload.groupNumber = form.groupNumber;
    if (form.effectiveDate) payload.effectiveDate = form.effectiveDate;
    if (form.expirationDate) payload.expirationDate = form.expirationDate;
    try {
      const res = await fetch(`${API_V1}/patients/${patientId}/insurance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to add insurance');
      }
      setShowForm(false);
      setForm({ ...EMPTY_INSURANCE });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add insurance');
    } finally {
      setSubmitting(false);
    }
  }

  async function setPrimary(record: InsuranceRecord) {
    await fetch(`${API_V1}/patients/${patientId}/insurance/${record._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPrimary: true }),
    });
    refresh();
  }

  async function remove(record: InsuranceRecord) {
    await fetch(`${API_V1}/patients/${patientId}/insurance/${record._id}`, { method: 'DELETE' });
    refresh();
  }

  if (isLoading)
    return <div className="h-32 animate-pulse rounded bg-neutral-100" aria-busy="true" />;

  return (
    <section aria-label="Patient insurance management">
      {canEdit && (
        <div className="mb-4">
          {showForm ? (
            <form
              onSubmit={handleAdd}
              className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <h3 className="font-medium text-neutral-900">Add Insurance</h3>
              {error && <p className="text-danger-600 text-sm">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  placeholder="Provider (e.g. Aetna)"
                  value={form.provider}
                  onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                  className="col-span-2 rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <input
                  required
                  placeholder="Policy Number"
                  value={form.policyNumber}
                  onChange={(e) => setForm((f) => ({ ...f, policyNumber: e.target.value }))}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <input
                  placeholder="Group Number"
                  value={form.groupNumber}
                  onChange={(e) => setForm((f) => ({ ...f, groupNumber: e.target.value }))}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <select
                  value={form.coverageType}
                  onChange={(e) => setForm((f) => ({ ...f, coverageType: e.target.value }))}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                  aria-label="Coverage type"
                >
                  {COVERAGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={form.isPrimary}
                    onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
                  />
                  Primary insurance
                </label>
                <label className="text-xs text-neutral-500">
                  Effective date
                  <input
                    type="date"
                    value={form.effectiveDate}
                    onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                    className="mt-0.5 block w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                  />
                </label>
                <label className="text-xs text-neutral-500">
                  Expiration date
                  <input
                    type="date"
                    value={form.expirationDate}
                    onChange={(e) => setForm((f) => ({ ...f, expirationDate: e.target.value }))}
                    className="mt-0.5 block w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Insurance'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError(null);
                  }}
                  className="rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <Button size="sm" onClick={() => setShowForm(true)}>
              + Add Insurance
            </Button>
          )}
        </div>
      )}

      {records.length === 0 ? (
        <EmptyState title="No insurance information on file" icon="🛡️" />
      ) : (
        <ol className="space-y-3" aria-label="Insurance records">
          {records.map((ins) => (
            <li
              key={ins._id}
              className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 font-medium text-neutral-900">
                    {ins.provider}
                    {ins.isPrimary && <Badge variant="primary">Primary</Badge>}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {ins.coverageType} · Policy {ins.policyNumber}
                    {ins.groupNumber && ` · Group ${ins.groupNumber}`}
                  </p>
                  {(ins.effectiveDate || ins.expirationDate) && (
                    <p className="mt-0.5 text-xs text-neutral-400">
                      {ins.effectiveDate ? `Effective ${formatDate(ins.effectiveDate)}` : ''}
                      {ins.expirationDate ? ` · Expires ${formatDate(ins.expirationDate)}` : ''}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-3">
                    {!ins.isPrimary && (
                      <button
                        onClick={() => setPrimary(ins)}
                        className="text-xs text-primary-600 hover:underline focus:outline-none"
                        aria-label={`Set ${ins.provider} as primary insurance`}
                      >
                        Set primary
                      </button>
                    )}
                    <button
                      onClick={() => remove(ins)}
                      className="text-xs text-red-600 hover:underline focus:outline-none"
                      aria-label={`Delete ${ins.provider} insurance`}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
