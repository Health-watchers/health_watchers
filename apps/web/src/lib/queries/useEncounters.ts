import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { API_V1 } from '@/lib/api';

export interface Encounter {
  id: string;
  patientId: string;
  clinicId: string;
  attendingDoctorId: string;
  chiefComplaint: string;
  status: 'open' | 'closed' | 'follow-up' | 'cancelled' | string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EncountersPage {
  data: Encounter[];
  meta: { total: number; page: number; limit: number };
}

export function useEncounters(page = 1, limit = 20) {
  return useQuery<EncountersPage>({
    queryKey: [...queryKeys.encounters.list(), page, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      const res = await fetch(`${API_V1}/encounters?${params}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return res.json();
    },
  });
}
