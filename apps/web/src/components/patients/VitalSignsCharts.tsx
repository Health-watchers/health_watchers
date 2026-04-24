'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ResponsiveContainer,
} from 'recharts';

interface VitalReading {
  date: string;
  vitals: {
    bloodPressure?: string;
    weight?: number;
    heartRate?: number;
    temperature?: number;
    oxygenSaturation?: number;
  };
}

interface Analytics {
  bloodPressure: {
    latest: { systolic: number; diastolic: number };
    average: { systolic: number; diastolic: number };
    trend: 'improving' | 'stable' | 'worsening';
    readings: number;
  } | null;
  weight: {
    latest: number;
    change30Days: number | null;
    trend: 'improving' | 'stable' | 'worsening';
  } | null;
  encounterFrequency: {
    last30Days: number;
    last90Days: number;
  };
}

interface VitalSignsChartsProps {
  vitals: VitalReading[];
  analytics: Analytics | null;
}

function trendColor(trend: string) {
  if (trend === 'improving') return 'text-green-600';
  if (trend === 'worsening') return 'text-red-600';
  return 'text-yellow-600';
}

function trendLabel(trend: string) {
  if (trend === 'improving') return '↓ Improving';
  if (trend === 'worsening') return '↑ Worsening';
  return '→ Stable';
}

export default function VitalSignsCharts({ vitals, analytics }: VitalSignsChartsProps) {
  // Prepare blood pressure chart data
  const bpData = vitals
    .filter((v) => v.vitals.bloodPressure)
    .map((v) => {
      const [sys, dia] = (v.vitals.bloodPressure as string).split('/').map(Number);
      return {
        date: new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        systolic: isNaN(sys) ? undefined : sys,
        diastolic: isNaN(dia) ? undefined : dia,
      };
    });

  // Prepare weight chart data
  const weightData = vitals
    .filter((v) => v.vitals.weight != null)
    .map((v) => ({
      date: new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      weight: v.vitals.weight,
    }));

  // Encounter frequency bar data
  const freqData = analytics
    ? [
        { period: 'Last 30 days', count: analytics.encounterFrequency.last30Days },
        { period: 'Last 90 days', count: analytics.encounterFrequency.last90Days },
      ]
    : [];

  return (
    <div className="space-y-8" role="region" aria-label="Vital signs charts">
      {/* Analytics Summary Cards */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {analytics.bloodPressure && (
            <div className="rounded-lg border border-neutral-200 p-4 bg-white">
              <h4 className="text-sm font-semibold text-neutral-700 mb-2">Blood Pressure</h4>
              <p className="text-2xl font-bold text-neutral-900">
                {analytics.bloodPressure.latest.systolic}/{analytics.bloodPressure.latest.diastolic}
                <span className="text-sm font-normal text-neutral-500 ml-1">mmHg</span>
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Avg: {analytics.bloodPressure.average.systolic}/{analytics.bloodPressure.average.diastolic} mmHg
                &nbsp;·&nbsp; {analytics.bloodPressure.readings} readings
              </p>
              <p className={`text-xs font-medium mt-1 ${trendColor(analytics.bloodPressure.trend)}`}>
                {trendLabel(analytics.bloodPressure.trend)}
              </p>
            </div>
          )}
          {analytics.weight && (
            <div className="rounded-lg border border-neutral-200 p-4 bg-white">
              <h4 className="text-sm font-semibold text-neutral-700 mb-2">Weight</h4>
              <p className="text-2xl font-bold text-neutral-900">
                {analytics.weight.latest}
                <span className="text-sm font-normal text-neutral-500 ml-1">kg</span>
              </p>
              {analytics.weight.change30Days !== null && (
                <p className="text-xs text-neutral-500 mt-1">
                  30-day change: {analytics.weight.change30Days > 0 ? '+' : ''}{analytics.weight.change30Days} kg
                </p>
              )}
              <p className={`text-xs font-medium mt-1 ${trendColor(analytics.weight.trend)}`}>
                {trendLabel(analytics.weight.trend)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Blood Pressure Chart */}
      {bpData.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-neutral-700 mb-3">Blood Pressure Over Time</h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={bpData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="systolic"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Systolic"
              />
              <Line
                type="monotone"
                dataKey="diastolic"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Diastolic"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Weight Chart */}
      {weightData.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-neutral-700 mb-3">Weight Over Time (kg)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weightData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Weight (kg)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Encounter Frequency */}
      {freqData.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-neutral-700 mb-3">Encounter Frequency</h4>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={freqData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" name="Encounters" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {bpData.length === 0 && weightData.length === 0 && (
        <p className="text-sm text-neutral-500 text-center py-6">
          No vital sign data available yet. Vital signs are recorded during encounters.
        </p>
      )}
    </div>
  );
}
