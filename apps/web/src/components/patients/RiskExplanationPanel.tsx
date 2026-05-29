'use client';

import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type Trend = 'improving' | 'stable' | 'worsening';

interface FactorWeight {
  factor: string;
  weight: number;
  percentage: number;
  trend: Trend;
}

interface RiskExplanation {
  riskScore: number;
  riskLevel: RiskLevel;
  lastCalculatedAt: string;
  factorWeights: FactorWeight[];
  improvedFactors: string[];
  naturalLanguageExplanation: string;
  recommendations: string[];
  disclaimer: string;
}

function trendIcon(trend: Trend) {
  if (trend === 'worsening') return { icon: '↑', color: 'text-red-500', label: 'Worsening' };
  if (trend === 'improving') return { icon: '↓', color: 'text-green-500', label: 'Improving' };
  return { icon: '→', color: 'text-neutral-400', label: 'Stable' };
}

function riskBarColor(level: RiskLevel) {
  if (level === 'critical') return 'bg-red-600';
  if (level === 'high') return 'bg-orange-500';
  if (level === 'medium') return 'bg-yellow-400';
  return 'bg-green-500';
}

interface Props {
  patientId: string;
  apiV1: string;
}

export default function RiskExplanationPanel({ patientId, apiV1 }: Props) {
  const { data, isLoading, error, refetch } = useQuery<RiskExplanation>({
    queryKey: ['risk-explanation', patientId],
    queryFn: async () => {
      const res = await fetch(`${apiV1}/patients/${patientId}/risk-explanation`, {
        credentials: 'include',
      });
      if (res.status === 404) return null as any;
      if (!res.ok) throw new Error('Failed to load risk explanation');
      const body = await res.json();
      return body.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Failed to load risk explanation.{' '}
        <button onClick={() => refetch()} className="underline">
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
        No risk explanation available. Run an AI assessment first.
      </div>
    );
  }

  const sortedFactors = [...data.factorWeights].sort((a, b) => b.weight - a.weight);

  return (
    <div className="space-y-5">
      {/* AI Explanation */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-900/20">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-1">
          AI Explanation
        </p>
        <p className="text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed">
          {data.naturalLanguageExplanation}
        </p>
      </div>

      {/* Factor Breakdown */}
      <div>
        <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
          Factor Breakdown
        </h4>
        <div className="space-y-3">
          {sortedFactors.map((f) => {
            const t = trendIcon(f.trend);
            return (
              <div key={f.factor}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">{f.factor}</span>
                    <span
                      className={`text-xs font-semibold ${t.color}`}
                      title={t.label}
                      aria-label={`Trend: ${t.label}`}
                    >
                      {t.icon} {t.label}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
                    {f.weight}pts · {f.percentage}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <div
                    className={`h-2 rounded-full ${riskBarColor(data.riskLevel)} transition-all`}
                    style={{ width: `${f.percentage}%` }}
                    role="progressbar"
                    aria-valuenow={f.percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${f.factor}: ${f.percentage}%`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Improved factors */}
      {data.improvedFactors.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 mb-1">
            Factors Resolved Since Last Assessment
          </p>
          <ul className="space-y-0.5">
            {data.improvedFactors.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                <span className="text-green-500">✓</span> {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
            Recommendations
          </h4>
          <ul className="space-y-2">
            {data.recommendations.map((rec, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-600 dark:bg-primary-900/40 dark:text-primary-400">
                  {i + 1}
                </span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-neutral-400 dark:text-neutral-500 italic">{data.disclaimer}</p>
    </div>
  );
}
