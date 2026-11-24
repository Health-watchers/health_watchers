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

function exportLabResultsCSV(labResults: LabResult[], patientId: string) {
  const rows = [
    [
      'Test',
      'Code',
      'Status',
      'Ordered',
      'Resulted',
      'Parameter',
      'Value',
      'Unit',
      'Reference',
      'Flag',
    ],
  ];
  for (const lab of labResults) {
    if (lab.results?.length) {
      for (const r of lab.results) {
        rows.push([
          lab.testName,
          lab.testCode ?? '',
          lab.status,
          lab.orderedAt,
          lab.resultedAt ?? '',
          r.parameter,
          r.value,
          r.unit,
          r.referenceRange,
          r.flag ?? '',
        ]);
      }
    } else {
      rows.push([
        lab.testName,
        lab.testCode ?? '',
        lab.status,
        lab.orderedAt,
        lab.resultedAt ?? '',
        '',
        '',
        '',
        '',
        '',
      ]);
    }
  }
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lab-results-${patientId}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function flagVariant(flag?: string) {
  if (flag === 'HH' || flag === 'LL') return 'danger';
  if (flag === 'H' || flag === 'L') return 'warning';
  return 'default';
}

function isCriticalFlag(flag?: string) {
  return flag === 'HH' || flag === 'LL';
}

function isAbnormalFlag(flag?: string) {
  return flag === 'H' || flag === 'L' || isCriticalFlag(flag);
}

interface TrendPoint {
  date: string;
  value: number;
  flag?: LabResultEntry['flag'];
}

interface TrendSeries {
  parameter: string;
  unit: string;
  referenceRange: string;
  points: TrendPoint[];
}

/**
 * Build per-parameter numeric time series from resulted lab results.
 * Only parameters whose values parse as numbers are included.
 */
function buildTrendSeries(labResults: LabResult[]): TrendSeries[] {
  const byParameter = new Map<string, TrendSeries>();
  const resulted = labResults
    .filter((lab) => lab.status === 'resulted' && lab.results?.length)
    .slice()
    .sort((a, b) => {
      const aDate = new Date(a.resultedAt ?? a.orderedAt).getTime();
      const bDate = new Date(b.resultedAt ?? b.orderedAt).getTime();
      return aDate - bDate;
    });

  for (const lab of resulted) {
    const date = lab.resultedAt ?? lab.orderedAt;
    for (const r of lab.results ?? []) {
      const numeric = Number.parseFloat(r.value);
      if (!Number.isFinite(numeric)) continue;
      const key = r.parameter.trim().toLowerCase();
      let series = byParameter.get(key);
      if (!series) {
        series = {
          parameter: r.parameter,
          unit: r.unit,
          referenceRange: r.referenceRange,
          points: [],
        };
        byParameter.set(key, series);
      }
      series.points.push({ date, value: numeric, flag: r.flag });
    }
  }

  return Array.from(byParameter.values()).filter((s) => s.points.length >= 2);
}

function TrendChart({ series }: { series: TrendSeries }) {
  const width = 320;
  const height = 120;
  const padding = 8;
  const values = series.points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = series.points.length > 1 ? (width - padding * 2) / (series.points.length - 1) : 0;

  const coords = series.points.map((p, i) => ({
    x: padding + i * stepX,
    y: height - padding - ((p.value - min) / range) * (height - padding * 2),
    point: p,
  }));

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const latest = series.points[series.points.length - 1];
  const latestCritical = isCriticalFlag(latest.flag);

  return (
    <div
      className={`rounded-lg border bg-white p-3 shadow-sm ${latestCritical ? 'border-red-300' : 'border-neutral-200'}`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-neutral-800">
          {series.parameter}
          {series.unit && <span className="ml-1 font-normal text-neutral-500">({series.unit})</span>}
        </p>
        <span
          className={`text-xs font-bold ${latestCritical ? 'text-red-700' : 'text-neutral-700'}`}
        >
          {latest.value}
          {latestCritical && ' ⚠'}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full"
        role="img"
        aria-label={`Trend chart for ${series.parameter}: ${series.points
          .map((p) => `${new Date(p.date).toLocaleDateString()}=${p.value}`)
          .join(', ')}`}
      >
        <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} />
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={isCriticalFlag(c.point.flag) ? 4 : 2.5}
            fill={isCriticalFlag(c.point.flag) ? '#dc2626' : isAbnormalFlag(c.point.flag) ? '#d97706' : '#2563eb'}
          />
        ))}
      </svg>
      <p className="mt-1 text-[10px] text-neutral-500">
        Reference: {series.referenceRange || '—'} · {series.points.length} data point(s)
      </p>
    </div>
  );
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
  const [orderForm, setOrderForm] = useState<OrderFormState>({
    testName: '',
    testCode: '',
    notes: '',
  });
  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [aiInterpretations, setAiInterpretations] = useState<Record<string, string>>({});
  const [interpretingId, setInterpretingId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'orderedAt' | 'testName'>('orderedAt');
  const [showTrends, setShowTrends] = useState(false);

  const {
    data: labResults = [],
    isLoading,
    error,
  } = useQuery<LabResult[]>({
    queryKey: queryKeys.labResults.byPatient(patientId),
    queryFn: async () => {
      const res = await fetch(
        `${API_V1}/patients/${patientId}/lab-results?sort=${sortBy}&order=desc`
      );
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

  const trendSeries = buildTrendSeries(labResults);
  const criticalCount = labResults.reduce(
    (count, lab) => count + (lab.results?.filter((r) => isCriticalFlag(r.flag)).length ?? 0),
    0
  );

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
      setAiInterpretations((prev) => ({
        ...prev,
        [labResultId]: 'AI interpretation unavailable.',
      }));
    } finally {
      setInterpretingId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-neutral-500">{labResults.length} result(s)</p>
          <select
            className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'orderedAt' | 'testName')}
            aria-label="Sort lab results by"
          >
            <option value="orderedAt">Sort by date</option>
            <option value="testName">Sort by test name</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {trendSeries.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowTrends((v) => !v)}>
              {showTrends ? 'Hide Trends' : '📈 Trends'}
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => setShowOrderForm((v) => !v)}>
            {showOrderForm ? 'Cancel' : '+ Order Test'}
          </Button>
          {labResults.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportLabResultsCSV(labResults, patientId)}
            >
              ↓ Export CSV
            </Button>
          )}
        </div>
      </div>

      {criticalCount > 0 && (
        <div
          className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
          role="alert"
        >
          ⚠ {criticalCount} critical value(s) require immediate attention
        </div>
      )}

      {showTrends && trendSeries.length > 0 && (
        <section className="mb-6" aria-label="Lab result trends">
          <h3 className="mb-2 text-sm font-semibold text-neutral-800">Trends Over Time</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trendSeries.map((series) => (
              <TrendChart key={series.parameter} series={series} />
            ))}
          </div>
        </section>
      )}

      {/* Order form */}
      {showOrderForm && (
        <form
          onSubmit={handleOrder}
          className="mb-6 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4"
          aria-label="Order new lab test"
        >
          <h3 className="text-sm font-semibold text-neutral-800">Order New Lab Test</h3>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600" htmlFor="testName">
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
            <label className="mb-1 block text-xs font-medium text-neutral-600" htmlFor="testCode">
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
            <label className="mb-1 block text-xs font-medium text-neutral-600" htmlFor="labNotes">
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
          {orderError && (
            <p className="text-xs text-red-600" role="alert">
              {orderError}
            </p>
          )}
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
          onRetry={() =>
            queryClient.invalidateQueries({ queryKey: queryKeys.labResults.byPatient(patientId) })
          }
        />
      ) : labResults.length === 0 ? (
        <EmptyState title="No lab results yet" icon="🧪" />
      ) : (
        <ol className="space-y-3" aria-label="Lab results">
          {labResults.map((lab) => {
            const hasCritical = lab.results?.some((r) => isCriticalFlag(r.flag));
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
                        <span className="ml-2 font-mono text-xs text-neutral-500">
                          {lab.testCode}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Ordered: {new Date(lab.orderedAt).toLocaleDateString()}
                      {lab.resultedAt &&
                        ` · Resulted: ${new Date(lab.resultedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasCritical && (
                      <span
                        className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700"
                        role="alert"
                      >
                        ⚠ CRITICAL
                      </span>
                    )}
                    <Badge variant={statusVariant(lab.status)}>{lab.status}</Badge>
                  </div>
                </div>

                {lab.notes && <p className="mt-2 text-sm text-neutral-600">{lab.notes}</p>}

                {/* Results table */}
                {lab.results && lab.results.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table
                      className="w-full border-collapse text-xs"
                      aria-label={`Results for ${lab.testName}`}
                    >
                      <thead>
                        <tr className="bg-neutral-50 uppercase tracking-wide text-neutral-500">
                          <th className="px-2 py-1 text-left font-semibold">Parameter</th>
                          <th className="px-2 py-1 text-left font-semibold">Value</th>
                          <th className="px-2 py-1 text-left font-semibold">Unit</th>
                          <th className="px-2 py-1 text-left font-semibold">Reference</th>
                          <th className="px-2 py-1 text-left font-semibold">Flag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lab.results.map((r, i) => {
                          const critical = isCriticalFlag(r.flag);
                          return (
                            <tr
                              key={i}
                              className={`border-t border-neutral-100 ${critical ? 'bg-red-50 font-semibold' : r.flag === 'H' || r.flag === 'L' ? 'bg-yellow-50' : ''}`}
                            >
                              <td className="px-2 py-1 text-neutral-800">
                                {critical && (
                                  <span className="mr-1 text-red-600" aria-hidden="true">
                                    ⚠
                                  </span>
                                )}
                                {r.parameter}
                              </td>
                              <td
                                className={`px-2 py-1 font-medium ${critical ? 'text-red-700' : 'text-neutral-900'}`}
                              >
                                {r.value}
                              </td>
                              <td className="px-2 py-1 text-neutral-500">{r.unit}</td>
                              <td className="px-2 py-1 text-neutral-500">{r.referenceRange}</td>
                              <td className="px-2 py-1">
                                {r.flag && r.flag !== 'N' && (
                                  <Badge variant={flagVariant(r.flag)}>{r.flag}</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
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
                        <p className="mt-1 text-sm text-neutral-600">
                          {aiInterpretations[lab._id]}
                        </p>
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
