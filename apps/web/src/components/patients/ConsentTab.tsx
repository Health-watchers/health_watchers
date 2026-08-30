'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState } from '@/components/ui';
import { API_V1 } from '@/lib/api';

const CONSENT_TYPES = [
  'treatment',
  'data_sharing',
  'ai_analysis',
  'research',
  'marketing',
] as const;

export function ConsentTab({ patientId, canEdit }: { patientId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [granting, setGranting] = useState<string | null>(null);

  const { data: consents = [], isLoading } = useQuery<any[]>({
    queryKey: ['consents', patientId],
    queryFn: async () => {
      const res = await fetch(`${API_V1}/patients/${patientId}/consent`);
      if (!res.ok) return [];
      return (await res.json()).data ?? [];
    },
  });

  const consentMap = Object.fromEntries(consents.map((c) => [c.type, c]));

  async function grant(type: string) {
    setGranting(type);
    try {
      await fetch(`${API_V1}/patients/${patientId}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      queryClient.invalidateQueries({ queryKey: ['consents', patientId] });
    } finally {
      setGranting(null);
    }
  }

  async function withdraw(type: string) {
    setGranting(type);
    try {
      await fetch(`${API_V1}/patients/${patientId}/consent/${type}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['consents', patientId] });
    } finally {
      setGranting(null);
    }
  }

  if (isLoading)
    return <div className="h-32 animate-pulse rounded bg-neutral-100" aria-busy="true" />;

  return (
    <section aria-label="Patient consent management">
      <p className="mb-4 text-sm text-neutral-500">
        Manage patient consent for data use and treatment. Withdrawal is immediate.
      </p>
      <ul className="space-y-3" role="list">
        {CONSENT_TYPES.map((type) => {
          const consent = consentMap[type];
          const isGranted =
            consent?.status === 'granted' &&
            (!consent.expiresAt || new Date(consent.expiresAt) > new Date());
          return (
            <li
              key={type}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div>
                <p className="font-medium capitalize text-neutral-900">{type.replace('_', ' ')}</p>
                {consent?.grantedAt && (
                  <p className="text-xs text-neutral-400">
                    {isGranted ? 'Granted' : 'Withdrawn'}{' '}
                    {new Date(consent.grantedAt).toLocaleDateString()}
                    {consent.expiresAt &&
                      ` · Expires ${new Date(consent.expiresAt).toLocaleDateString()}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${isGranted ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}
                >
                  {isGranted
                    ? 'Granted'
                    : consent?.status === 'withdrawn'
                      ? 'Withdrawn'
                      : 'Not set'}
                </span>
                {canEdit &&
                  (isGranted ? (
                    <button
                      onClick={() => withdraw(type)}
                      disabled={granting === type}
                      className="text-xs text-red-600 hover:underline focus:outline-none disabled:opacity-50"
                      aria-label={`Withdraw ${type} consent`}
                    >
                      Withdraw
                    </button>
                  ) : (
                    <button
                      onClick={() => grant(type)}
                      disabled={granting === type}
                      className="text-xs text-primary-600 hover:underline focus:outline-none disabled:opacity-50"
                      aria-label={`Grant ${type} consent`}
                    >
                      Grant
                    </button>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
