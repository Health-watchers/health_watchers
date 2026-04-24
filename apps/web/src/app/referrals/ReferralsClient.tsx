'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  EmptyState,
  ErrorMessage,
  PageWrapper,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toast,
} from '@/components/ui';
import { API_V1 } from '@/lib/api';

type Urgency = 'routine' | 'urgent' | 'emergency';
type ReferralStatus = 'pending' | 'accepted' | 'declined' | 'completed';

interface Referral {
  _id: string;
  patientId: { _id: string; firstName: string; lastName: string; systemId: string } | null;
  fromClinicId: { _id: string; name: string } | null;
  toClinicId: { _id: string; name: string } | null;
  reason: string;
  urgency: Urgency;
  status: ReferralStatus;
  notes?: string;
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

async function fetchReferrals(direction: 'incoming' | 'outgoing'): Promise<Referral[]> {
  const res = await fetch(`${API_V1}/referrals/${direction}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load referrals');
  const data = await res.json();
  return data.data ?? [];
}

function ReferralCard({
  referral,
  direction,
  onAccept,
  onDecline,
}: {
  referral: Referral;
  direction: 'incoming' | 'outgoing';
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
}) {
  const patient = referral.patientId;
  const clinic = direction === 'incoming' ? referral.fromClinicId : referral.toClinicId;

  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-neutral-900">
            {patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown patient'}
            {patient?.systemId && (
              <span className="ml-2 font-mono text-xs text-neutral-400">{patient.systemId}</span>
            )}
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {direction === 'incoming' ? 'From' : 'To'}: {clinic?.name ?? '—'}
          </p>
          <p className="text-sm text-neutral-700 mt-1">{referral.reason}</p>
          {referral.notes && <p className="text-xs text-neutral-400 mt-0.5 italic">{referral.notes}</p>}
          <p className="text-xs text-neutral-400 mt-1">{new Date(referral.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={URGENCY_VARIANT[referral.urgency]}>{referral.urgency}</Badge>
          <Badge variant={STATUS_VARIANT[referral.status]}>{referral.status}</Badge>
        </div>
      </div>
      {direction === 'incoming' && referral.status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" onClick={() => onAccept?.(referral._id)}>
            Accept
          </Button>
          <Button size="sm" variant="outline" onClick={() => onDecline?.(referral._id)}>
            Decline
          </Button>
        </div>
      )}
    </li>
  );
}

export default function ReferralsClient() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: incoming = [], isLoading: incomingLoading, error: incomingError } = useQuery<Referral[]>({
    queryKey: ['referrals', 'incoming'],
    queryFn: () => fetchReferrals('incoming'),
  });

  const { data: outgoing = [], isLoading: outgoingLoading, error: outgoingError } = useQuery<Referral[]>({
    queryKey: ['referrals', 'outgoing'],
    queryFn: () => fetchReferrals('outgoing'),
  });

  const handleAccept = async (id: string) => {
    try {
      const res = await fetch(`${API_V1}/referrals/${id}/accept`, { method: 'PUT', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to accept referral');
      setToast({ message: 'Referral accepted', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['referrals', 'incoming'] });
    } catch {
      setToast({ message: 'Failed to accept referral', type: 'error' });
    }
  };

  const handleDecline = async (id: string) => {
    const reason = window.prompt('Reason for declining (optional):') ?? '';
    try {
      const res = await fetch(`${API_V1}/referrals/${id}/decline`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ declinedReason: reason }),
      });
      if (!res.ok) throw new Error('Failed to decline referral');
      setToast({ message: 'Referral declined', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['referrals', 'incoming'] });
    } catch {
      setToast({ message: 'Failed to decline referral', type: 'error' });
    }
  };

  return (
    <PageWrapper className="py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Referrals</h1>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'incoming' | 'outgoing')}>
        <TabsList>
          <TabsTrigger value="incoming">
            Incoming
            {incoming.filter((r) => r.status === 'pending').length > 0 && (
              <span className="ml-2 rounded-full bg-warning-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {incoming.filter((r) => r.status === 'pending').length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="outgoing">Outgoing</TabsTrigger>
        </TabsList>

        <TabsContent value="incoming">
          {incomingLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-neutral-100" />)}
            </div>
          ) : incomingError ? (
            <ErrorMessage message="Failed to load incoming referrals" onRetry={() => queryClient.invalidateQueries({ queryKey: ['referrals', 'incoming'] })} />
          ) : incoming.length === 0 ? (
            <EmptyState title="No incoming referrals" icon="📥" />
          ) : (
            <ol className="space-y-3">
              {incoming.map((r) => (
                <ReferralCard key={r._id} referral={r} direction="incoming" onAccept={handleAccept} onDecline={handleDecline} />
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="outgoing">
          {outgoingLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-neutral-100" />)}
            </div>
          ) : outgoingError ? (
            <ErrorMessage message="Failed to load outgoing referrals" onRetry={() => queryClient.invalidateQueries({ queryKey: ['referrals', 'outgoing'] })} />
          ) : outgoing.length === 0 ? (
            <EmptyState title="No outgoing referrals" icon="📤" />
          ) : (
            <ol className="space-y-3">
              {outgoing.map((r) => (
                <ReferralCard key={r._id} referral={r} direction="outgoing" />
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
