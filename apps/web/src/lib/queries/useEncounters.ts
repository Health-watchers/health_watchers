import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

import { API_V1 } from '@/lib/api';

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
