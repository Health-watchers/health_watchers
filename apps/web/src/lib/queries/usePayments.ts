import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export interface Payment {
  id: string;
  patientId: string;
  amount: string;
  asset?: string;
  status: 'pending' | 'completed' | 'failed' | string;
  txHash?: string;
  createdAt?: string;
}

export function usePayments() {
  return useQuery<Payment[]>({
    queryKey: queryKeys.payments.list(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/payments`);
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }

      const data = await res.json();
      return data.data ?? data ?? [];
    },
  });
}
