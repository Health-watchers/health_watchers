'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { portalFetch, portalGet } from '@/lib/portalApi';

type MetricType = 'weight' | 'blood_pressure' | 'blood_glucose' | 'exercise';

interface HealthLogEntry {
  _id: string;
  metricType: MetricType;
  value: number;
  valueDiastolic?: number;
  unit: string;
  loggedAt: string;
  notes?: string;
  isAlert: boolean;
}

const METRIC_OPTIONS: { value: MetricType; label: string; unit: string; placeholder: string }[] = [
  { value: 'weight',         label: 'Weight',        unit: 'kg',    placeholder: 'e.g. 75' },
  { value: 'blood_pressure', label: 'Blood Pressure', unit: 'mmHg', placeholder: 'Systolic (e.g. 120)' },
  { value: 'blood_glucose',  label: 'Blood Glucose',  unit: 'mg/dL', placeholder: 'e.g. 100' },
  { value: 'exercise',       label: 'Exercise',       unit: 'min',  placeholder: 'Duration in minutes' },
];

function toChartData(entries: HealthLogEntry[]) {
  return [...entries]
    .sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime())
    .map((e) => ({
      date: new Date(e.loggedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: e.value,
      diastolic: e.valueDiastolic,
    }));
}

export default function HealthLogPage() {
  const [entries, setEntries] = useState<HealthLogEntry[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('weight');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [value, setValue] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [notes, setNotes] = useState('');

  const metricInfo = METRIC_OPTIONS.find((m) => m.value === selectedMetric)!;

  async function loadEntries(metric: MetricType) {
    setLoading(true);
    setError(null);
    try {
      const data = await portalGet<HealthLogEntry[]>(`/health-log?metricType=${metric}&limit=30`);
      setEntries(data);
    } catch {
      setError('Failed to load health log.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries(selectedMetric);
  }, [selectedMetric]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    setError(null);
    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        metricType: selectedMetric,
        value: parseFloat(value),
        unit: metricInfo.unit,
        notes: notes || undefined,
      };
      if (selectedMetric === 'blood_pressure' && diastolic) {
        body.valueDiastolic = parseFloat(diastolic);
      }

      const res = await portalFetch('/health-log', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.message || 'Failed to save entry.');
        return;
      }
      if (json.alert) setAlert(json.alert);

      setValue('');
      setDiastolic('');
      setNotes('');
      loadEntries(selectedMetric);
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  const chartData = toChartData(entries);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Health Log</h1>

      {/* Metric selector */}
      <div className="flex flex-wrap gap-2">
        {METRIC_OPTIONS.map((m) => (
          <button
            key={m.value}
            onClick={() => setSelectedMetric(m.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              selectedMetric === m.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Log form */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold text-gray-700">Log {metricInfo.label}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                {selectedMetric === 'blood_pressure' ? 'Systolic (mmHg)' : `${metricInfo.label} (${metricInfo.unit})`}
              </label>
              <input
                type="number"
                step="any"
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={metricInfo.placeholder}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            {selectedMetric === 'blood_pressure' && (
              <div className="flex-1 min-w-[140px]">
                <label className="mb-1 block text-xs font-medium text-gray-600">Diastolic (mmHg)</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={diastolic}
                  onChange={(e) => setDiastolic(e.target.value)}
                  placeholder="e.g. 80"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              placeholder="Any context or observations…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save Entry'}
          </button>
        </form>

        {alert && (
          <div role="alert" className="mt-3 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            ⚠️ <strong>Alert:</strong> {alert}
          </div>
        )}
        {error && (
          <div role="alert" className="mt-3 rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
            {error}
          </div>
        )}
      </section>

      {/* Trend chart */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold text-gray-700">{metricInfo.label} Trend (last 30 entries)</h2>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-gray-400">No entries yet. Log your first reading above.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              {selectedMetric === 'blood_pressure' ? (
                <Legend />
              ) : null}
              <Line
                type="monotone"
                dataKey="value"
                name={selectedMetric === 'blood_pressure' ? 'Systolic' : metricInfo.label}
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              {selectedMetric === 'blood_pressure' && (
                <Line
                  type="monotone"
                  dataKey="diastolic"
                  name="Diastolic"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Recent entries table */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Recent Entries</h2>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400">No entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Value</th>
                  <th className="pb-2 pr-4">Notes</th>
                  <th className="pb-2">Alert</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e._id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-4 text-gray-600">
                      {new Date(e.loggedAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-4 font-medium text-gray-800">
                      {e.metricType === 'blood_pressure' && e.valueDiastolic
                        ? `${e.value}/${e.valueDiastolic}`
                        : e.value}{' '}
                      <span className="text-xs font-normal text-gray-500">{e.unit}</span>
                    </td>
                    <td className="py-2 pr-4 text-gray-500">{e.notes ?? '—'}</td>
                    <td className="py-2">
                      {e.isAlert ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Alert
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
