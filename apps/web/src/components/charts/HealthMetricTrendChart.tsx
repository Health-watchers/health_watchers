'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui';

const ResponsiveContainer = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false }
);

const LineChart = dynamic(() => import('recharts').then((mod) => mod.LineChart), { ssr: false });
const Line = dynamic(() => import('recharts').then((mod) => mod.Line), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((mod) => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((mod) => mod.CartesianGrid), {
  ssr: false,
});
const Tooltip = dynamic(() => import('recharts').then((mod) => mod.Tooltip), { ssr: false });
const Legend = dynamic(() => import('recharts').then((mod) => mod.Legend), { ssr: false });

type MetricType = 'weight' | 'blood_pressure' | 'blood_glucose' | 'exercise_minutes' | 'heart_rate';

const METRIC_COLORS: Record<MetricType, string> = {
  weight: '#3b82f6',
  blood_pressure: '#ef4444',
  blood_glucose: '#f59e0b',
  exercise_minutes: '#10b981',
  heart_rate: '#8b5cf6',
};

interface ChartDataPoint {
  date: string;
  value: number;
  flagged: boolean;
}

interface HealthMetricTrendChartProps {
  chartData: ChartDataPoint[];
  selectedMetric: MetricType;
  currentLabel: string;
  currentUnit: string;
}

export function HealthMetricTrendChart({
  chartData,
  selectedMetric,
  currentLabel,
  currentUnit,
}: HealthMetricTrendChartProps) {
  if (chartData.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-400">
        No data yet. Log your first reading above.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(value: number) => [`${value} ${currentUnit}`, currentLabel]} />
        <Legend />
        <Line
          type="monotone"
          dataKey="value"
          name={currentLabel}
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
  );
}

export default HealthMetricTrendChart;
