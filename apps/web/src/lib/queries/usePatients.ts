import { useQuery } from '@tanstack/react-query';
import { type Patient } from '@health-watchers/types';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export interface PatientFilters {
  q?: string;
  status?: string;
  sex?: string;
  dobFrom?: string;
  dobTo?: string;
  condition?: string;
}

export function usePatients(filters: PatientFilters = {}) {
  return useQuery<Patient[]>({
    queryKey: queryKeys.patients.list(JSON.stringify(filters)),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.status) params.set('status', filters.status);
      if (filters.sex) params.set('sex', filters.sex);
      if (filters.dobFrom) params.set('dobFrom', filters.dobFrom);
      if (filters.dobTo) params.set('dobTo', filters.dobTo);
      if (filters.condition) params.set('condition', filters.condition);

      const url = params.toString()
        ? `${API_V1}/patients/search?${params.toString()}`
        : `${API_V1}/patients`;

      const res = await fetchWithAuth(url);
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }

      const data = await res.json();
      return data.data || [];
    },
  });
}
