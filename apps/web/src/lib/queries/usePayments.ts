import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const API_V1 = API_BASE_URL.endsWith('/api/v1')
  ? API_BASE_URL
  : `${API_BASE_URL.replace(/\/$/, '')}/api/v1`;

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
      const res = await fetch(`${API_V1}/payments`);
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }

      const data = await res.json();
      return data.data ?? data ?? [];
    },
  });
}
