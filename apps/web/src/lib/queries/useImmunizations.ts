import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export type ImmunizationStatus = 'administered' | 'scheduled' | 'overdue' | 'upcoming';

export interface ImmunizationRecord {
  _id: string;
  vaccine: string;
  dateAdministered: string;
  administrator?: string;
  lotNumber?: string;
  site?: string;
  notes?: string;
  nextDoseDate?: string;
  patientId?: string;
}

export interface UpcomingVaccine {
  _id: string;
  vaccine: string;
  dueDate: string;
  status: ImmunizationStatus;
  description?: string;
}

export interface ImmunizationDraft {
  vaccine: string;
  dateAdministered: string;
  administrator?: string;
  lotNumber?: string;
  site?: string;
  notes?: string;
  nextDoseDate?: string;
}

export function useImmunizationRecords() {
  return useQuery<ImmunizationRecord[]>({
    queryKey: queryKeys.immunizations.list(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/immunizations`);
      if (!res.ok) throw new Error(`Failed to load immunization records (${res.status})`);
      const data = await res.json();
      return data.data ?? [];
    },
  });
}

export function useUpcomingVaccines() {
  return useQuery<UpcomingVaccine[]>({
    queryKey: queryKeys.immunizations.upcoming(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/immunizations/upcoming`);
      if (!res.ok) throw new Error(`Failed to load upcoming vaccines (${res.status})`);
      const data = await res.json();
      return data.data ?? [];
    },
  });
}

export function useCreateImmunization() {
  const queryClient = useQueryClient();
  return useMutation<ImmunizationRecord, Error, ImmunizationDraft>({
    mutationFn: async (draft) => {
      const res = await fetchWithAuth(`${API_V1}/immunizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`Failed to save immunization (${res.status})`);
      const data = await res.json();
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.immunizations.all });
    },
  });
}
