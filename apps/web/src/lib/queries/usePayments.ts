import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export interface Payment {
  id: string;
  intentId?: string;
  patientId: string;
  amount: string;
  asset?: string;
  assetCode?: string;
  status: 'pending' | 'confirmed' | 'failed' | string;
  txHash?: string;
  confirmedAt?: string;
  createdAt?: string;
}

export function usePayments(refetchInterval?: number | false) {
  return useQuery<Payment[]>({
    queryKey: queryKeys.payments.list(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/payments`);
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }

      const res = await fetch(`${API_V1}/payments`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      return data.data ?? data ?? [];
    },
    refetchInterval: refetchInterval ?? false,
  });
}

/** Poll a single payment's status every 5 s until it leaves 'pending' */
export function usePaymentStatus(intentId: string | null) {
  return useQuery<Payment>({
    queryKey: [...queryKeys.payments.all, 'status', intentId],
    queryFn: async () => {
      const res = await fetch(`${API_V1}/payments/status/${intentId}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      return data.data ?? data;
    },
    enabled: !!intentId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' ? 5000 : false;
    },
  });
}
