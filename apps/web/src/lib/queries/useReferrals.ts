import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export type ReferralUrgency = 'routine' | 'urgent' | 'emergency';
export type ReferralStatus = 'pending' | 'accepted' | 'declined' | 'completed';

export interface Referral {
  _id: string;
  patientId: { _id: string; firstName: string; lastName: string; systemId: string } | null;
  fromClinicId: { _id: string; name: string } | null;
  toClinicId: { _id: string; name: string } | null;
  reason: string;
  urgency: ReferralUrgency;
  status: ReferralStatus;
  notes?: string;
  declinedReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ReferralDraft {
  patientId: string;
  toClinicId: string;
  reason: string;
  urgency: ReferralUrgency;
  notes?: string;
}

export function useReferrals(status?: ReferralStatus) {
  return useQuery<Referral[]>({
    queryKey: queryKeys.referrals.list(status),
    queryFn: async () => {
      const url = status
        ? `${API_V1}/referrals?status=${encodeURIComponent(status)}`
        : `${API_V1}/referrals`;
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error(`Failed to load referrals (${res.status})`);
      const data = await res.json();
      return data.data ?? [];
    },
  });
}

export function useCreateReferral() {
  const queryClient = useQueryClient();
  return useMutation<Referral, Error, ReferralDraft>({
    mutationFn: async (draft) => {
      const res = await fetchWithAuth(`${API_V1}/referrals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`Failed to create referral (${res.status})`);
      const data = await res.json();
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.referrals.all });
    },
  });
}

export function useUpdateReferralStatus() {
  const queryClient = useQueryClient();
  return useMutation<
    Referral,
    Error,
    { id: string; status: ReferralStatus; declinedReason?: string }
  >({
    mutationFn: async ({ id, status, declinedReason }) => {
      const res = await fetchWithAuth(`${API_V1}/referrals/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, declinedReason }),
      });
      if (!res.ok) throw new Error(`Failed to update referral (${res.status})`);
      const data = await res.json();
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.referrals.all });
    },
  });
}
