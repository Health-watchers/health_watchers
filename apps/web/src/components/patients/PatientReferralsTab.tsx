'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorMessage } from '@/components/ui';
import { API_V1 } from '@/lib/api';

type Urgency = 'routine' | 'urgent' | 'emergency';
type ReferralStatus = 'pending' | 'accepted' | 'declined' | 'completed';

interface PatientReferral {
  _id: string;
  fromClinicId: { name: string } | null;
  toClinicId: { name: string } | null;
  reason: string;
  urgency: Urgency;
  status: ReferralStatus;
  createdAt: string;
}

const URGENCY_VARIANT: Record<Urgency, 'danger' | 'warning' | 'default'> = {
  emergency: 'danger',
  urgent: 'warning',
  routine: 'default',
};

const STATUS_VARIANT: Record<ReferralStatus, 'warning' | 'success' | 'danger' | 'default'> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'danger',
  completed: 'default',
};

export default function PatientReferralsTab({ patientId }: { patientId: string }) {
  const { data = [], isLoading, error, refetch } = useQuery<PatientReferral[]>({
    queryKey: ['patient-referrals', patientId],
    queryFn: async () => {
      // Fetch both directions and filter by patientId client-side
      const [outRes, inRes] = await Promise.all([
        fetch(`${API_V1}/referrals/outgoing`, { credentials: 'include' }),
        fetch(`${API_V1}/referrals/incoming`, { credentials: 'include' }),
      ]);
      const [out, inc] = await Promise.all([outRes.json(), inRes.json()]);
      const all = [...(out.data ?? []), ...(inc.data ?? [])];
      return all.filter((r: any) => {
        const pid = r.patientId?._id ?? r.patientId;
        return pid === patientId;
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-neutral-100" />)}
      </div>
    );
  }

  if (error) return <ErrorMessage message="Failed to load referrals" onRetry={refetch} />;
  if (data.length === 0) return <EmptyState title="No referrals for this patient" icon="🔀" />;

  return (
    <ol className="space-y-3">
      {data.map((r) => (
        <li key={r._id} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-neutral-900">{r.reason}</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {r.fromClinicId?.name ?? '—'} → {r.toClinicId?.name ?? '—'}
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">{new Date(r.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={URGENCY_VARIANT[r.urgency]}>{r.urgency}</Badge>
              <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
