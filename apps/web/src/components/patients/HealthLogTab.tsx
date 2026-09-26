'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorMessage } from '@/components/ui';
import { API_V1 } from '@/lib/api';

interface HealthLogEntry {
  metricType: string;
  value: number;
  unit: string;
  loggedAt: string;
  notes?: string;
  flagged: boolean;
}

export function HealthLogTab({ patientId }: { patientId: string }) {
  const { data, isLoading, error } = useQuery<HealthLogEntry[]>({
    queryKey: ['health-log', patientId],
    queryFn: async () => {
      const res = await fetch(`${API_V1}/patients/${patientId}/health-log`);
      if (!res.ok) throw new Error('Failed to load health log');
      return (await res.json()).data ?? [];
    },
  });

  if (isLoading) return <div className="h-24 animate-pulse rounded bg-neutral-100" />;
  if (error) return <ErrorMessage message="Failed to load health log" />;
  if (!data?.length) return <EmptyState title="No health metrics logged yet" icon="📊" />;

  return (
    <section aria-label="Patient health log">
      <p className="mb-3 text-sm text-neutral-500">{data.length} entries</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="pb-2 pr-4">Date</th>
              <th className="pb-2 pr-4">Metric</th>
              <th className="pb-2 pr-4">Value</th>
              <th className="pb-2 pr-4">Notes</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((l, i) => (
              <tr key={i} className="border-b border-neutral-50 hover:bg-neutral-50">
                <td className="py-2 pr-4 text-neutral-500">
                  {new Date(l.loggedAt).toLocaleString()}
                </td>
                <td className="py-2 pr-4 capitalize text-neutral-700">
                  {l.metricType.replace('_', ' ')}
                </td>
                <td className="py-2 pr-4 font-medium text-neutral-900">
                  {l.value} {l.unit}
                </td>
                <td className="py-2 pr-4 text-neutral-500">{l.notes ?? '—'}</td>
                <td className="py-2">
                  {l.flagged ? (
                    <Badge variant="danger">Abnormal</Badge>
                  ) : (
                    <Badge variant="success">Normal</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
