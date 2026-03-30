import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const API_V1 = API_BASE_URL.endsWith('/api/v1')
  ? API_BASE_URL
  : `${API_BASE_URL.replace(/\/$/, '')}/api/v1`;

export interface Encounter {
  id: string;
  patientId: string;
  date: string;
  notes: string;
}

export function useEncounters() {
  return useQuery<Encounter[]>({
    queryKey: queryKeys.encounters.list(),
    queryFn: async () => {
      const res = await fetch(`${API_V1}/encounters`);
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }

      const data = await res.json();
      return data.data || data || [];
    },
  });
}
