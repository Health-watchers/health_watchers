import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export interface Diagnosis {
  code: string;
  description: string;
  isPrimary?: boolean;
}

export interface Encounter {
  id: string;
  patientId: string;
  patient?: { firstName: string; lastName: string; systemId?: string };
  clinicId: string;
  attendingDoctorId: string;
  chiefComplaint: string;
  status: 'open' | 'closed' | 'follow-up' | 'cancelled' | string;
  notes?: string;
  diagnosis?: Diagnosis[];
  createdAt?: string;
  updatedAt?: string;
}

export interface EncountersPage {
  data: Encounter[];
  meta: { total: number; page: number; limit: number };
}

export interface EncounterFilters {
  q?: string;
  status?: string;
  diagnosisCode?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: 'createdAt_desc' | 'createdAt_asc' | 'patientName_asc';
  patientId?: string;
  doctorId?: string;
}

export function useEncounters(page = 1, limit = 20, filters: EncounterFilters = {}) {
  return useQuery<EncountersPage>({
    queryKey: [...queryKeys.encounters.list(), page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });

      if (filters.q) params.set('q', filters.q);
      if (filters.status) params.set('status', filters.status);
      if (filters.diagnosisCode) params.set('diagnosisCode', filters.diagnosisCode);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.patientId) params.set('patientId', filters.patientId);
      if (filters.doctorId) params.set('doctorId', filters.doctorId);

      const res = await fetchWithAuth(`${API_V1}/encounters?${params}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return res.json();
    },
  });
}
