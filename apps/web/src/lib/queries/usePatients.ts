import { useQuery } from '@tanstack/react-query';
import { type Patient } from '@health-watchers/types';
import { queryKeys } from '@/lib/queryKeys';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const API_V1 = API_BASE_URL.endsWith('/api/v1')
  ? API_BASE_URL
  : `${API_BASE_URL.replace(/\/$/, '')}/api/v1`;

export function usePatients(searchQuery?: string) {
  return useQuery<Patient[]>({
    queryKey: queryKeys.patients.list(searchQuery || undefined),
    queryFn: async () => {
      const url = searchQuery
        ? `${API_V1}/patients/search?q=${encodeURIComponent(searchQuery)}`
        : `${API_V1}/patients`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }

      const data = await res.json();
      return data.data || [];
    },
  });
}
