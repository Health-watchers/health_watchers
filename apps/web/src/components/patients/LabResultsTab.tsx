'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, ErrorMessage } from '@/components/ui';
import { queryKeys } from '@/lib/queryKeys';
import { API_V1 } from '@/lib/api';

interface LabResultEntry {
  parameter: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag?: 'H' | 'L' | 'HH' | 'LL' | 'N';
}

interface LabResult {
  _id: string;
  testName: string;
  testCode?: string;
  status: 'ordered' | 'pending' | 'resulted' | 'cancelled';
  orderedAt: string;
  resultedAt?: string;
  results?: LabResultEntry[];
  notes?: string;
}

function flagVariant(flag?: string) {
  if (flag === 'HH' || flag === 'LL') return 'danger';
  if (flag === 'H' || flag === 'L') return 'warning';
  return 'default';
}

function statusVariant(status: string) {
  if (status === 'resulted') return 'success';
  if (status === 'ordered' || status === 'pending') return 'warning';
  if (status === 'cancelled') return 'danger';
  return 'default';
}

interface OrderFormState {
  testName: string;
  testCode: string;
  notes: string;
}

export default function LabResultsTab({ patientId }: { patientId: string }) {
  const queryClient = useQueryClient();
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderForm, setOrderForm] = useState<OrderFormState>({ testName: '', testCode: '', notes: '' });
  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [aiInterpretations, setAiInterpretations] = useState<Record<string, string>>({});
  const [interpretingId, setInterpretingId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'orderedAt' | 'testName'>('orderedAt');

  const { data: labResults = [], isLoading, error } = useQuery<LabResult[]>({
    queryKey: queryKeys.labResults.byPatient(patientId),
    queryFn: async () => {
      const res = await fetch(`${API_V1}/patients/${patientId}/lab-results?sort=${sortBy}&order=desc`);
      if (!res.ok) throw new Error('Failed to load lab results');
      const data = await res.json();
      return data.data ?? [];
    },
  });

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderForm.testName.trim()) return;
    setOrdering(true);
    setOrderError(null);
    try {
      const res = await fetch(`${API_V1}/lab-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, ...orderForm }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      setShowOrderForm(false);
      setOrderForm({ testName: '', testCode: '', notes: '' });
      queryClient.invalidateQueries({ queryKey: queryKeys.labResults.byPatient(patientId) });
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Failed to order test');
    } finally {
      setOrdering(false);
    }
  };

  const handleInterpret = async (labResultId: string) => {
    setInterpretingId(labResultId);
    try {
      const res = await fetch(`${API_V1}/ai/interpret-labs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labResultId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'AI unavailable');
      setAiInterpretations((prev) => ({ ...prev, [labResultId]: body.interpretation }));
    } catch {
      setAiInterpretations((prev) => ({ ...prev, [labResultId]: 'AI interpretation unavailable.' }));
    } finally {
      setInterpretingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-neutral-500">{labResults.length} result(s)</p>
          <select
            className="text-xs border border-neutral-200 rounded px-2 py-1 text-neutral-600"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'orderedAt' | 'testName')}
            aria-label="Sort lab results by"
          >
            <option value="orderedAt">Sort by date</option>
            <option value="testName">Sort by test name</option>
          </select>
        </div>
        <Button size="sm" variant="primary" onClick={() => setShowOrderForm((v) => !v)}>
          {showOrderForm ? 'Cancel' : '+ Order Test'}
        </Button>
      </div>

      {/* Order form */}
      {showOrderForm && (
        <form
          onSubmit={handleOrder}
          className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-3"
          aria-label="Order new lab test"
        >
          <h3 className="text-sm font-semibold text-neutral-800">Order New Lab Test</h3>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="testName">
              Test Name <span aria-hidden="true">*</span>
            </label>
            <input
              id="testName"
              required
              className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={orderForm.testName}
              onChange={(e) => setOrderForm((f) => ({ ...f, testName: e.target.value }))}
              placeholder="e.g. Complete Blood Count"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="testCode">
              LOINC Code (optional)
            </label>
            <input
              id="testCode"
              className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={orderForm.testCode}
              onChange={(e) => setOrderForm((f) => ({ ...f, testCode: e.target.value }))}
              placeholder="e.g. 58410-2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="labNotes">
              Notes (optional)
            </label>
            <textarea
              id="labNotes"
              rows={2}
              className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={orderForm.notes}
              onChange={(e) => setOrderForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          {orderError && <p className="text-xs text-red-600" role="alert">{orderError}</p>}
          <Button type="submit" size="sm" variant="primary" disabled={ordering}>
            {ordering ? 'Ordering…' : 'Order Test'}
          </Button>
        </form>
      )}

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-neutral-100" />
          ))}
        </div>
      ) : error ? (
        <ErrorMessage
          message={error instanceof Error ? error.message : 'Failed to load lab results'}
          onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.labResults.byPatient(patientId) })}
        />
      ) : labResults.length === 0 ? (
        <EmptyState title="No lab results yet" icon="🧪" />
      ) : (
        <ol className="space-y-3" aria-label="Lab results">
          {labResults.map((lab) => {
            const hasCritical = lab.results?.some((r) => r.flag === 'HH' || r.flag === 'LL');
            return (
              <li
                key={lab._id}
                className={`rounded-lg border bg-white p-4 shadow-sm ${hasCritical ? 'border-red-300' : 'border-neutral-200'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-neutral-900">
                      {lab.testName}
                      {lab.testCode && (
                        <span className="ml-2 text-xs text-neutral-400 font-mono">{lab.testCode}</span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Ordered: {new Date(lab.orderedAt).toLocaleDateString()}
                      {lab.resultedAt && ` · Resulted: ${new Date(lab.resultedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasCritical && (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700" role="alert">
                        ⚠ CRITICAL
                      </span>
                    )}
                    <Badge variant={statusVariant(lab.status)}>{lab.status}</Badge>
                  </div>
                </div>

                {lab.notes && (
                  <p className="mt-2 text-sm text-neutral-600">{lab.notes}</p>
                )}

                {/* Results table */}
                {lab.results && lab.results.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs border-collapse" aria-label={`Results for ${lab.testName}`}>
                      <thead>
                        <tr className="bg-neutral-50 text-neutral-500 uppercase tracking-wide">
                          <th className="px-2 py-1 text-left font-semibold">Parameter</th>
                          <th className="px-2 py-1 text-left font-semibold">Value</th>
                          <th className="px-2 py-1 text-left font-semibold">Unit</th>
                          <th className="px-2 py-1 text-left font-semibold">Reference</th>
                          <th className="px-2 py-1 text-left font-semibold">Flag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lab.results.map((r, i) => (
                          <tr
                            key={i}
                            className={`border-t border-neutral-100 ${r.flag === 'HH' || r.flag === 'LL' ? 'bg-red-50' : r.flag === 'H' || r.flag === 'L' ? 'bg-yellow-50' : ''}`}
                          >
                            <td className="px-2 py-1 text-neutral-800">{r.parameter}</td>
                            <td className="px-2 py-1 font-medium text-neutral-900">{r.value}</td>
                            <td className="px-2 py-1 text-neutral-500">{r.unit}</td>
                            <td className="px-2 py-1 text-neutral-500">{r.referenceRange}</td>
                            <td className="px-2 py-1">
                              {r.flag && r.flag !== 'N' && (
                                <Badge variant={flagVariant(r.flag)}>{r.flag}</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* AI interpretation */}
                {lab.status === 'resulted' && lab.results && lab.results.length > 0 && (
                  <div className="mt-3">
                    {aiInterpretations[lab._id] ? (
                      <details open>
                        <summary className="cursor-pointer text-xs font-medium text-primary-600 hover:underline">
                          AI Interpretation
                        </summary>
                        <p className="mt-1 text-sm text-neutral-600">{aiInterpretations[lab._id]}</p>
                      </details>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleInterpret(lab._id)}
                        disabled={interpretingId === lab._id}
                        aria-busy={interpretingId === lab._id}
                      >
                        {interpretingId === lab._id ? 'Interpreting…' : '🤖 AI Interpret'}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
