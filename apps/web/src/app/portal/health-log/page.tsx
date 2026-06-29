'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { portalFetch, portalGet } from '@/lib/portalApi';

type MetricType = 'weight' | 'blood_pressure' | 'blood_glucose' | 'exercise_minutes' | 'heart_rate';

interface HealthLog {
  _id: string;
  metricType: MetricType;
  value: number;
  unit: string;
  loggedAt: string;
  notes?: string;
  flagged: boolean;
}

const METRIC_OPTIONS: { value: MetricType; label: string; unit: string }[] = [
  { value: 'weight', label: 'Weight', unit: 'kg' },
  { value: 'blood_pressure', label: 'Blood Pressure (systolic)', unit: 'mmHg' },
  { value: 'blood_glucose', label: 'Blood Glucose', unit: 'mmol/L' },
  { value: 'exercise_minutes', label: 'Exercise', unit: 'min' },
  { value: 'heart_rate', label: 'Heart Rate', unit: 'bpm' },
];

const METRIC_COLORS: Record<MetricType, string> = {
  weight: '#3b82f6',
  blood_pressure: '#ef4444',
  blood_glucose: '#f59e0b',
  exercise_minutes: '#10b981',
  heart_rate: '#8b5cf6',
};

export default function HealthLogPage() {
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('weight');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({ value: '', notes: '' });

  const fetchLogs = useCallback(async (metric: MetricType) => {
    setLoading(true);
    try {
      const data = await portalGet<HealthLog[]>(`/health-log?metricType=${metric}&limit=30`);
      setLogs(data);
    } catch {
      setError('Failed to load health logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(selectedMetric);
  }, [selectedMetric, fetchLogs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.value) return;
    setSubmitting(true);
    setAlert(null);
    setError(null);
    try {
      const option = METRIC_OPTIONS.find((m) => m.value === selectedMetric)!;
      const res = await portalFetch('/health-log', {
        method: 'POST',
        body: JSON.stringify({
          metricType: selectedMetric,
          value: parseFloat(form.value),
          unit: option.unit,
          notes: form.notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Failed to log metric');
      if (json.alert) {
        setAlert(
          `⚠️ Your ${option.label} reading of ${form.value} ${option.unit} is outside the normal range. Please consult your care team.`
        );
      }
      setForm({ value: '', notes: '' });
      await fetchLogs(selectedMetric);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to log metric');
    } finally {
      setSubmitting(false);
    }
  }

  const chartData = [...logs].reverse().map((l) => ({
    date: new Date(l.loggedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: l.value,
    flagged: l.flagged,
  }));

  const currentOption = METRIC_OPTIONS.find((m) => m.value === selectedMetric)!;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Health Metrics Log</h1>

      {/* Metric selector */}
      <div className="flex flex-wrap gap-2">
        {METRIC_OPTIONS.map((m) => (
          <button
            key={m.value}
            onClick={() => setSelectedMetric(m.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              selectedMetric === m.value
                ? 'bg-blue-600 text-white'
                : 'border border-gray-300 bg-white text-gray-600 hover:border-blue-400'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Log form */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold text-gray-700">Log {currentOption.label}</h2>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Value ({currentOption.unit})
            </label>
            <input
              type="number"
              step="any"
              required
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              className="w-28 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="0.0"
            />
          </div>
          <div className="min-w-40 flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">Notes (optional)</label>
            <input
              type="text"
              value={form.notes}
              maxLength={500}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="e.g. after breakfast"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Log Metric'}
          </button>
        </form>
      </section>

      {/* Threshold alert */}
      {alert && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {alert}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {/* Trend chart */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold text-gray-700">
          {currentOption.label} Trend ({currentOption.unit})
        </h2>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-gray-400">No data yet. Log your first reading above.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [
                  `${value} ${currentOption.unit}`,
                  currentOption.label,
                ]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="value"
                name={currentOption.label}
                stroke={METRIC_COLORS[selectedMetric]}
                strokeWidth={2}
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  return payload.flagged ? (
                    <circle
                      key={`dot-${cx}-${cy}`}
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill="#ef4444"
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <circle
                      key={`dot-${cx}-${cy}`}
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill={METRIC_COLORS[selectedMetric]}
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* History table */}
      {!loading && logs.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-gray-700">Recent Entries</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-medium tracking-wide text-gray-500 uppercase">
                  <th className="pr-4 pb-2">Date</th>
                  <th className="pr-4 pb-2">Value</th>
                  <th className="pr-4 pb-2">Notes</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l._id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-600">
                      {new Date(l.loggedAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 font-medium text-gray-800">
                      {l.value} {l.unit}
                    </td>
                    <td className="py-2 pr-4 text-gray-500">{l.notes ?? '—'}</td>
                    <td className="py-2">
                      {l.flagged ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          ⚠ Abnormal
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Normal
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
