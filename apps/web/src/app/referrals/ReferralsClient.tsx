'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  EmptyState,
  ErrorMessage,
  Input,
  Modal,
  PageWrapper,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
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
  declinedReason?: string;
  createdAt: string;
  updatedAt?: string;
}

interface StatusEvent {
  status: ReferralStatus;
  label: string;
  date?: string;
}

interface ReferralFormData {
  patientId: string;
  toClinicId: string;
  reason: string;
  urgency: Urgency;
  notes: string;
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

const STATUS_ORDER: ReferralStatus[] = ['pending', 'accepted', 'completed'];

const URGENCY_OPTIONS = [
  { value: 'routine', label: 'Routine' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'emergency', label: 'Emergency' },
];

const INITIAL_FORM: ReferralFormData = {
  patientId: '',
  toClinicId: '',
  reason: '',
  urgency: 'routine',
  notes: '',
};

async function fetchReferrals(direction: 'incoming' | 'outgoing'): Promise<Referral[]> {
  const res = await fetch(`${API_V1}/referrals/${direction}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load referrals');
  const data = await res.json();
  return data.data ?? [];
}

function buildTimeline(referral: Referral): StatusEvent[] {
  const isDeclined = referral.status === 'declined';

  if (isDeclined) {
    return [
      { status: 'pending', label: 'Referral Created', date: referral.createdAt },
      { status: 'declined', label: 'Declined', date: referral.updatedAt },
    ];
  }

  const completedStatuses: ReferralStatus[] = STATUS_ORDER.filter((s) => {
    const idx = STATUS_ORDER.indexOf(s);
    const currentIdx = STATUS_ORDER.indexOf(referral.status);
    return idx <= currentIdx;
  });

  return completedStatuses.map((s, i) => ({
    status: s,
    label: s === 'pending' ? 'Referral Created' : s.charAt(0).toUpperCase() + s.slice(1),
    date:
      i === 0
        ? referral.createdAt
        : i === completedStatuses.length - 1
          ? referral.updatedAt
          : undefined,
  }));
}

function StatusTimeline({ referral }: { referral: Referral }) {
  const events = buildTimeline(referral);
  return (
    <div className="mt-4 space-y-3">
      {events.map((event, idx) => (
        <div key={event.status} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div
              className={[
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                event.status === 'declined'
                  ? 'bg-red-100 text-red-600'
                  : STATUS_VARIANT[event.status] === 'success'
                    ? 'bg-green-100 text-green-700'
                    : STATUS_VARIANT[event.status] === 'warning'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-200 text-gray-600',
              ].join(' ')}
            >
              ✓
            </div>
            {idx < events.length - 1 && <div className="my-2 h-8 w-0.5 bg-gray-200" />}
          </div>
          <div className="flex-1 py-2">
            <p className="font-medium text-gray-900">{event.label}</p>
            {event.date && (
              <p className="text-xs text-gray-500">{new Date(event.date).toLocaleString()}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
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
  const [expanded, setExpanded] = useState(false);
  const patient = referral.patientId;
  const clinic = direction === 'incoming' ? referral.fromClinicId : referral.toClinicId;

  return (
    <li className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left hover:bg-gray-50"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900">
              {patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown patient'}
              {patient?.systemId && (
                <span className="ml-2 font-mono text-xs text-gray-400">{patient.systemId}</span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-gray-600">
              {direction === 'incoming' ? 'From' : 'To'}: {clinic?.name ?? '—'}
            </p>
            <p className="mt-1 text-sm text-gray-700">{referral.reason}</p>
            {referral.declinedReason && (
              <p className="mt-0.5 text-xs text-red-600">Declined: {referral.declinedReason}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {new Date(referral.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={URGENCY_VARIANT[referral.urgency]}>{referral.urgency}</Badge>
            <Badge variant={STATUS_VARIANT[referral.status]}>{referral.status}</Badge>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 px-4 pb-4">
          {referral.notes && (
            <div className="mt-4">
              <p className="text-xs font-medium text-gray-600">Notes</p>
              <p className="mt-1 text-sm text-gray-700">{referral.notes}</p>
            </div>
          )}

          <div className="mt-4">
            <p className="mb-3 text-xs font-medium text-gray-600">Status Timeline</p>
            <StatusTimeline referral={referral} />
          </div>

          {direction === 'incoming' && referral.status === 'pending' && (
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => onAccept?.(referral._id)}>
                Accept
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onDecline?.(referral._id)}>
                Decline
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function NewReferralModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<ReferralFormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: keyof ReferralFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patientId || !form.toClinicId || !form.reason) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_V1}/referrals`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: form.patientId,
          toClinicId: form.toClinicId,
          reason: form.reason,
          urgency: form.urgency,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to create referral');
      setForm(INITIAL_FORM);
      onCreated();
    } catch {
      setError('Failed to create referral. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Referral" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Patient ID *"
            placeholder="Patient system ID"
            value={form.patientId}
            onChange={(e) => handleChange('patientId', e.target.value)}
            required
          />
          <Input
            label="Referring To (Clinic ID) *"
            placeholder="Destination clinic ID"
            value={form.toClinicId}
            onChange={(e) => handleChange('toClinicId', e.target.value)}
            required
          />
        </div>
        <Input
          label="Reason *"
          placeholder="Reason for referral"
          value={form.reason}
          onChange={(e) => handleChange('reason', e.target.value)}
          required
        />
        <Select
          label="Urgency"
          options={URGENCY_OPTIONS}
          value={form.urgency}
          onChange={(e) => handleChange('urgency', e.target.value as Urgency)}
        />
        <Textarea
          label="Notes"
          placeholder="Additional clinical notes"
          value={form.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          rows={3}
        />
        {error && <p className="text-danger-500 text-sm">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Send Referral
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function ReferralsClient() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'incoming' | 'outgoing' | 'history'>('incoming');
  const [showNewReferral, setShowNewReferral] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'completed' | 'declined'>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | Urgency>('all');

  const {
    data: incoming = [],
    isLoading: incomingLoading,
    error: incomingError,
  } = useQuery<Referral[]>({
    queryKey: ['referrals', 'incoming'],
    queryFn: () => fetchReferrals('incoming'),
  });

  const {
    data: outgoing = [],
    isLoading: outgoingLoading,
    error: outgoingError,
  } = useQuery<Referral[]>({
    queryKey: ['referrals', 'outgoing'],
    queryFn: () => fetchReferrals('outgoing'),
  });

  const handleAccept = async (id: string) => {
    try {
      const res = await fetch(`${API_V1}/referrals/${id}/accept`, {
        method: 'PUT',
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
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
      if (!res.ok) throw new Error();
      setToast({ message: 'Referral declined', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['referrals', 'incoming'] });
    } catch {
      setToast({ message: 'Failed to decline referral', type: 'error' });
    }
  };

  const handleReferralCreated = () => {
    setShowNewReferral(false);
    setToast({ message: 'Referral sent successfully', type: 'success' });
    queryClient.invalidateQueries({ queryKey: ['referrals', 'outgoing'] });
  };

  // History = completed + declined from both directions
  const allReferrals = [...incoming, ...outgoing];
  const seen = new Set<string>();
  const history = allReferrals.filter((r) => {
    if (seen.has(r._id)) return false;
    seen.add(r._id);
    return r.status === 'completed' || r.status === 'declined';
  });

  const activePendingCount = incoming.filter((r) => r.status === 'pending').length;

  return (
    <PageWrapper className="py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Referrals</h1>
        <Button onClick={() => setShowNewReferral(true)}>+ New Referral</Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="incoming">
            Incoming
            {activePendingCount > 0 && (
              <span className="bg-warning-500 ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white">
                {activePendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="outgoing">Outgoing</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="incoming">
          {incomingLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : incomingError ? (
            <ErrorMessage
              message="Failed to load incoming referrals"
              onRetry={() => queryClient.invalidateQueries({ queryKey: ['referrals', 'incoming'] })}
            />
          ) : incoming.filter((r) => r.status !== 'completed' && r.status !== 'declined').length ===
            0 ? (
            <EmptyState title="No active incoming referrals" icon="📥" />
          ) : (
            <ol className="space-y-3">
              {incoming
                .filter((r) => r.status !== 'completed' && r.status !== 'declined')
                .map((r) => (
                  <ReferralCard
                    key={r._id}
                    referral={r}
                    direction="incoming"
                    onAccept={handleAccept}
                    onDecline={handleDecline}
                  />
                ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="outgoing">
          {outgoingLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : outgoingError ? (
            <ErrorMessage
              message="Failed to load outgoing referrals"
              onRetry={() => queryClient.invalidateQueries({ queryKey: ['referrals', 'outgoing'] })}
            />
          ) : outgoing.filter((r) => r.status !== 'completed' && r.status !== 'declined').length ===
            0 ? (
            <EmptyState title="No active outgoing referrals" icon="📤" />
          ) : (
            <ol className="space-y-3">
              {outgoing
                .filter((r) => r.status !== 'completed' && r.status !== 'declined')
                .map((r) => (
                  <ReferralCard key={r._id} referral={r} direction="outgoing" />
                ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="history">
          {incomingLoading || outgoingLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
                  <select
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value as any)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="completed">Completed</option>
                    <option value="declined">Declined</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Urgency</label>
                  <select
                    value={urgencyFilter}
                    onChange={(e) => setUrgencyFilter(e.target.value as any)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
              </div>

              {history.length === 0 ? (
                <EmptyState title="No referral history" icon="📋" />
              ) : (
                <ol className="space-y-3">
                  {history
                    .filter((r) => historyFilter === 'all' || r.status === historyFilter)
                    .filter((r) => urgencyFilter === 'all' || r.urgency === urgencyFilter)
                    .map((r) => (
                      <ReferralCard
                        key={r._id}
                        referral={r}
                        direction={r.toClinicId ? 'outgoing' : 'incoming'}
                      />
                    ))}
                </ol>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <NewReferralModal
        open={showNewReferral}
        onClose={() => setShowNewReferral(false)}
        onCreated={handleReferralCreated}
      />
    </PageWrapper>
  );
}
