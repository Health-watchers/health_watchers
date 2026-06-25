import Link from 'next/link';
import { Card } from '@/components/ui';

interface PatientMetricsData {
  total: number;
  active: number;
  inactive: number;
  byRisk: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

interface PatientMetricsProps {
  data: PatientMetricsData;
}

const riskConfig = [
  { key: 'critical' as const, label: 'Critical', bar: 'bg-red-500', text: 'text-red-600' },
  { key: 'high' as const, label: 'High', bar: 'bg-orange-400', text: 'text-orange-600' },
  { key: 'medium' as const, label: 'Medium', bar: 'bg-yellow-400', text: 'text-yellow-600' },
  { key: 'low' as const, label: 'Low', bar: 'bg-green-400', text: 'text-green-600' },
];

export function PatientMetrics({ data }: PatientMetricsProps) {
  const maxRisk = Math.max(...Object.values(data.byRisk), 1);
  const activeRate = data.total > 0 ? Math.round((data.active / data.total) * 100) : 0;

  return (
    <Card className="flex flex-col gap-4 p-4" role="region" aria-label="Patient population metrics">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          🧑‍⚕️ Patient Population
        </h2>
        <Link
          href="/patients"
          className="text-xs text-primary-600 hover:underline focus:outline-none focus-visible:underline"
          aria-label="View all patients"
        >
          View all
        </Link>
      </div>

      {/* Total / Active / Inactive */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Total', value: data.total, color: 'text-primary-600' },
          { label: 'Active', value: data.active, color: 'text-green-600' },
          { label: 'Inactive', value: data.inactive, color: 'text-neutral-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-md bg-neutral-50 p-2 dark:bg-neutral-800">
            <p className={`text-lg font-bold ${color}`}>{value}</p>
            <p className="text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Active rate bar */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
          <span>Active rate</span>
          <span>{activeRate}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100" role="img" aria-label={`${activeRate}% active patients`}>
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${activeRate}%` }}
          />
        </div>
      </div>

      {/* Risk level breakdown */}
      <div>
        <p className="mb-2 text-xs font-medium text-neutral-500 uppercase tracking-wide">
          By Risk Level
        </p>
        <ul className="space-y-2" aria-label="Patient risk level breakdown">
          {riskConfig.map(({ key, label, bar, text }) => (
            <li key={key} className="flex items-center gap-2">
              <span className={`w-14 text-xs font-medium ${text}`}>{label}</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={`h-full ${bar} transition-all`}
                  style={{ width: `${Math.round((data.byRisk[key] / maxRisk) * 100)}%` }}
                />
              </div>
              <span className="w-6 text-right text-xs text-neutral-600 dark:text-neutral-400">
                {data.byRisk[key]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
