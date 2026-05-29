'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { fetchWithAuth } from '@/lib/auth';

const RiskExplanationPanel = dynamic(() => import('./RiskExplanationPanel'), { ssr: false });

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface RiskHistory {
  _id: string;
  riskScore: number;
  riskLevel: RiskLevel;
  riskFactors: string[];
  recommendations?: string;
  calculatedAt: string;
  source: string;
}

function riskVariant(level: RiskLevel) {
  if (level === 'critical' || level === 'high') return 'danger' as const;
  if (level === 'medium') return 'warning' as const;
  return 'success' as const;
}

interface Props {
  patient: {
    riskScore?: number;
    riskLevel?: RiskLevel;
    riskFactors?: string[];
    lastRiskCalculatedAt?: string;
  };
  patientId: string;
  apiV1: string;
}

export default function RiskTab({ patient, patientId, apiV1 }: Props) {
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState('');
  const [showExplanation, setShowExplanation] = useState(false);

  const { data: history = [], isLoading } = useQuery<RiskHistory[]>({
    queryKey: ['risk-history', patientId],
    queryFn: async () => {
      const res = await fetchWithAuth(`${apiV1}/patients/${patientId}/risk-history`);
      if (!res.ok) return [];
      const d = await res.json();
      return d.data ?? [];
    },
  });

  const assessMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`${apiV1}/ai/risk-assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || d.error || 'Failed');
      return d.data;
    },
    onSuccess: () => {
      setMsg('Risk assessment complete.');
      queryClient.invalidateQueries({ queryKey: ['risk-history', patientId] });
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      queryClient.invalidateQueries({ queryKey: ['risk-explanation', patientId] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const current = patient;

  return (
    <div className="space-y-6">
      {/* Current risk summary */}
      <div className="rounded-lg border border-gray-200 dark:border-neutral-700 p-4 dark:bg-neutral-800/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-neutral-100">Current Risk Assessment</h3>
          <Button
            size="sm"
            variant="primary"
            onClick={() => assessMutation.mutate()}
            disabled={assessMutation.isPending}
          >
            {assessMutation.isPending ? <Spinner size="sm" /> : 'Run AI Assessment'}
          </Button>
        </div>

        {current.riskLevel ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge variant={riskVariant(current.riskLevel)} className="text-sm px-3 py-1">
                {current.riskLevel.toUpperCase()} RISK
              </Badge>
              <span className="text-2xl font-bold text-gray-900 dark:text-neutral-100">
                {current.riskScore ?? '—'}
                <span className="text-sm font-normal text-gray-500 dark:text-neutral-400">/100</span>
              </span>
            </div>

            {current.riskFactors && current.riskFactors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase mb-2">
                  Contributing Factors
                </p>
                <ul className="space-y-1">
                  {current.riskFactors.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-700 dark:text-neutral-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {current.lastRiskCalculatedAt && (
              <p className="text-xs text-gray-400 dark:text-neutral-500">
                Last calculated: {new Date(current.lastRiskCalculatedAt).toLocaleString()}
              </p>
            )}

            {/* Explanation toggle */}
            <button
              type="button"
              onClick={() => setShowExplanation((v) => !v)}
              className="mt-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline focus:outline-none"
            >
              {showExplanation ? '▲ Hide explanation' : '▼ Show factor breakdown & recommendations'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            No risk assessment yet. Click "Run AI Assessment" to calculate.
          </p>
        )}

        {msg && (
          <p
            className={`mt-3 text-sm font-medium ${
              msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error')
                ? 'text-red-600 dark:text-red-400'
                : 'text-green-600 dark:text-green-400'
            }`}
          >
            {msg}
          </p>
        )}
      </div>

      {/* Explanation panel */}
      {showExplanation && current.riskLevel && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 dark:bg-neutral-800/50">
          <h3 className="font-semibold text-gray-900 dark:text-neutral-100 mb-4">
            Risk Factor Breakdown
          </h3>
          <RiskExplanationPanel patientId={patientId} apiV1={apiV1} />
        </div>
      )}

      {/* History */}
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-neutral-100 mb-3">Risk Score History</h3>
        {isLoading ? (
          <Spinner />
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400">No history available.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div
                key={h._id}
                className="rounded border border-gray-100 dark:border-neutral-700 p-3 text-sm dark:bg-neutral-800/30"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={riskVariant(h.riskLevel)}>{h.riskLevel}</Badge>
                    <span className="font-semibold dark:text-neutral-200">{h.riskScore}/100</span>
                    <span className="text-xs text-gray-400 dark:text-neutral-500 capitalize">
                      {h.source}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-neutral-500">
                    {new Date(h.calculatedAt).toLocaleDateString()}
                  </span>
                </div>
                {h.riskFactors.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
                    {h.riskFactors.join(' · ')}
                  </p>
                )}
                {h.recommendations && (
                  <p className="mt-1 text-xs text-gray-600 dark:text-neutral-400 italic">
                    {h.recommendations}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
